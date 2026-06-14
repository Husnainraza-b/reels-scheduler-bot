import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import axios from 'axios';
import { Readable } from 'stream';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SupabaseService } from '../database/supabase.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * Processes incoming Slack file uploads with Tenant Routing:
 * 1. Parses the @username from the caption to determine which account.
 * 2. Validates the account exists in the database.
 * 3. Downloads the file from Slack as a stream.
 * 4. Pipes the stream directly to Cloudflare R2.
 * 5. Adds the video to the posting queue via the Gap Finder engine.
 * 6. Deletes the original file from the Slack workspace.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly webClient: WebClient;
  private readonly botToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly supabaseService: SupabaseService,
    private readonly schedulerService: SchedulerService,
    private readonly analyticsService: AnalyticsService,
  ) {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');

    if (!token) {
      throw new Error(
        'CRITICAL: SLACK_BOT_TOKEN is missing from environment variables.',
      );
    }

    this.botToken = token;
    this.webClient = new WebClient(this.botToken);

    this.logger.log('Slack WebClient initialized successfully.');
  }

  /**
   * Full file lifecycle with Tenant Routing:
   * Parse @username → Validate account → Download → Stream to R2 → Queue → Delete
   *
   * @param event - The Slack message event containing file attachments.
   */
  async processIncomingFile(event: {
    text?: string;
    files?: Array<{
      id: string;
      url_private_download: string;
      mimetype: string;
      name: string;
    }>;
    channel: string;
    user: string;
  }): Promise<void> {
    const rawText = event.text?.trim() || '';
    const hasFiles = event.files && event.files.length > 0;

    // --- PHASE 1: Safety Gate ---
    // If no files are attached, this MUST be treated as a command
    if (!hasFiles && rawText) {
      await this.routeCommand(rawText, event);
      return;
    }

    if (!hasFiles) {
      this.logger.warn('processIncomingFile called with no files and no text. Skipping.');
      return;
    }

    // --- If files are attached, text is EXCLUSIVELY a caption. Bypass command parsing. ---

    // --- Step 1: Parse @username from caption ---
    const rawCaption = rawText;
    this.logger.debug(`--> [SERVICE] Raw caption received: ${rawCaption}`);
    const { username, caption } = this.parseCaption(rawCaption);
    this.logger.debug(`--> [SERVICE] Extracted Username: ${username} | Cleaned Caption: ${caption}`);

    if (!username) {
      this.logger.warn(
        `No @username found in caption: "${rawCaption}". Alerting user.`,
      );
      await this.sendSlackError(
        event.channel,
        event.user,
        '❌ *Error:* Please specify a valid account username at the start of your caption.\n\n' +
          'Format: `@username Your caption here`\n' +
          'Example: `@football_edits Here is the new reel!`',
      );
      return;
    }

    // --- Step 2: Validate the account exists in the database ---
    let account;
    try {
      account = await this.lookupAccount(username);
      if (!account) {
        this.logger.error(`[DB EXCEPTION] Account not found for username: ${username}`);
      }
    } catch (dbError) {
      this.logger.error(`[DB EXCEPTION] Error during account lookup for username: ${username}`, dbError instanceof Error ? dbError.stack : String(dbError));
      account = null;
    }

    if (!account) {
      this.logger.warn(
        `Account "@${username}" not found in database. Alerting user.`,
      );
      await this.sendSlackError(
        event.channel,
        event.user,
        `❌ Upload Failed: Account "@${username}" does not exist in the system.`,
      );
      return;
    }

    this.logger.log(
      `🎯 Tenant routed: @${username} → account_id: ${account.id}`,
    );

    // --- Step 3: Process each file ---
    for (const file of event.files!) {
      const fileId = file.id;
      const downloadUrl = file.url_private_download;
      const originalName = file.name || 'video.mp4';
      const mimetype = file.mimetype || '';

      // Non-video file rejection
      if (!mimetype.startsWith('video/')) {
        this.logger.warn(`Non-video file uploaded: ${mimetype}. Alerting user.`);
        await this.sendSlackError(
          event.channel,
          event.user,
          `❌ *Error:* Only video files are accepted.\n` +
            `You uploaded: \`${originalName}\` (${mimetype})`,
        );
        continue;
      }

      // Generate a unique filename to avoid collisions in R2
      const extension = originalName.split('.').pop() || 'mp4';
      const uniqueFileName = `${Date.now()}-${fileId}.${extension}`;

      this.logger.log(
        `📥 Downloading file "${originalName}" (ID: ${fileId}) from Slack...`,
      );

      let publicUrl: string | undefined;

      try {
        // --- Download from Slack as a stream ---
        const response = await axios.get<Readable>(downloadUrl, {
          responseType: 'stream',
          headers: {
            Authorization: `Bearer ${this.botToken}`,
          },
        });

        const fileStream: Readable = response.data;

        // --- Stream directly to Cloudflare R2 ---
        this.logger.log(
          `☁️  Streaming "${uniqueFileName}" to Cloudflare R2...`,
        );

        try {
          publicUrl = await this.cloudflareR2Service.uploadVideo(
            fileStream,
            uniqueFileName,
          );
          this.logger.log(
            `✅ Upload complete. Public URL: ${publicUrl}`,
          );
        } catch (r2Error) {
          this.logger.error(`[R2 EXCEPTION] Failed to upload video to Cloudflare R2: ${uniqueFileName}`, r2Error instanceof Error ? r2Error.stack : String(r2Error));
          throw r2Error;
        }

        // --- Add to queue via Gap Finder engine ---
        let queueRecord;
        try {
          queueRecord = await this.schedulerService.addToQueue(
            account.id,
            publicUrl,
            caption,
            fileId,
          );
        } catch (dbError) {
          this.logger.error(`[DB EXCEPTION] Failed to insert queue record via Gap Finder for account ${account.id}`, dbError instanceof Error ? dbError.stack : String(dbError));
          throw dbError;
        }

        this.logger.log(
          `📅 Video queued for @${username}: scheduled_for = ${queueRecord.scheduled_for}`,
        );

        // --- Send confirmation to Slack ---
        await this.webClient.chat.postMessage({
          channel: event.channel,
          text:
            `✅ *Video queued for @${username}!*\n\n` +
            `📅 Scheduled: ${queueRecord.scheduled_for}\n` +
            `📝 Caption: ${caption || '(none)'}\n` +
            `🎬 File: \`${uniqueFileName}\``,
        });

        // --- Delete the original file from Slack workspace ---
        this.logger.log(
          `🗑️  Deleting file "${fileId}" from Slack workspace...`,
        );

        try {
          await this.webClient.files.delete({ file: fileId });
          this.logger.log(
            `✅ File "${fileId}" deleted from Slack successfully.`,
          );
        } catch (slackDeleteError) {
          this.logger.warn(
            `Could not delete file "${fileId}" from Slack workspace (likely due to human-authorship / missing scope limitations). Skipping deletion.`,
            slackDeleteError instanceof Error ? slackDeleteError.message : String(slackDeleteError),
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Failed to process file "${fileId}" (${originalName}).`,
          error instanceof Error ? error.stack : String(error),
        );

        // If R2 upload succeeded but queue insert failed, clean up the orphan file
        if (publicUrl) {
          try {
            await this.cloudflareR2Service.deleteVideo(uniqueFileName);
            this.logger.log(`🗑️  Cleaned up orphan R2 file: "${uniqueFileName}"`);
          } catch (r2CleanupError) {
            this.logger.warn(
              `Failed to clean up orphan R2 file "${uniqueFileName}". ` +
              `Manual cleanup may be needed.`,
            );
          }
        }

        await this.sendSlackError(
          event.channel,
          event.user,
          `❌ *Error processing file:* \`${originalName}\`\n\n` +
            `\`${error instanceof Error ? error.message : String(error)}\``,
        );
      }
    }
  }

  // --- PHASE 2: Strict Command Routing ---
  private async routeCommand(rawText: string, event: { channel: string; user: string }): Promise<void> {
    const cleanText = rawText.trim();
    const lowerText = cleanText.toLowerCase();

    // Remove any leading bot mention if present (e.g. <@U123456> system overview)
    const normalizedText = cleanText.replace(/^<@U[A-Z0-9]+>\s*/i, '');
    const normalizedLower = normalizedText.toLowerCase();

    // 1. Master Directory
    if (normalizedLower === 'commands' || normalizedLower === '@commands' || normalizedLower === 'system commands') {
      await this.handleCommandsDirectory(event.channel);
      return;
    }

    // 2. System Overview / Analytics
    if (normalizedLower === 'system overview' || normalizedLower === 'analytics') {
      await this.handleAnalyticsCommand(event.channel);
      return;
    }

    // 3. Pause Queue
    const pauseMatch = normalizedLower.match(/^pause-queue\s+@(\S+)$/i);
    if (pauseMatch) {
      await this.handleQueueToggleCommand(event.channel, pauseMatch[1], 'paused');
      return;
    }

    // 4. Resume Queue
    const resumeMatch = normalizedLower.match(/^resume-queue\s+@(\S+)$/i);
    if (resumeMatch) {
      await this.handleQueueToggleCommand(event.channel, resumeMatch[1], 'active');
      return;
    }

    // 5. Add Slot
    const addSlotMatch = normalizedText.match(/^add-slot\s+((?:["“”][^"“”]+["“”]\s*)+)@(\S+)$/i);
    if (addSlotMatch) {
      await this.handleSlotCommand(event.channel, addSlotMatch[1], addSlotMatch[2], 'add');
      return;
    }

    // 6. Remove Slot
    const removeSlotMatch = normalizedText.match(/^remove-slot\s+((?:["“”][^"“”]+["“”]\s*)+)@(\S+)$/i);
    if (removeSlotMatch) {
      await this.handleSlotCommand(event.channel, removeSlotMatch[1], removeSlotMatch[2], 'remove');
      return;
    }

    // If no match, Abort and show syntax error
    await this.webClient.chat.postMessage({
      channel: event.channel,
      text: '❌ *Syntax Error*. Type `@commands` or `system commands` to see the correct format for system commands.',
    });
  }

  // --- PHASE 4: Master Directory ---
  private async handleCommandsDirectory(channel: string): Promise<void> {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤖 System Commands Directory',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Upload a Video*\nUpload a video file with the caption and `@accountname` in the message.',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Pause/Resume Queue*\n`pause-queue @accountname`\n`resume-queue @accountname`',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Slot Management*\n`add-slot "time" "time" @accountname`\n`remove-slot "time" "time" @accountname`\n_(Example: add-slot "8:00 AM" "6:00PM" @football_edits)_',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Analytics Dashboard*\n`system overview` or `analytics`',
        },
      },
    ];

    await this.webClient.chat.postMessage({
      channel,
      text: 'System Commands Directory',
      blocks,
    });
  }

  // --- PHASE 3: Slot Management Logic ---
  private async handleSlotCommand(channel: string, timesStr: string, username: string, action: 'add' | 'remove'): Promise<void> {
    try {
      const account = await this.lookupAccount(username);
      if (!account) {
        await this.webClient.chat.postMessage({
          channel,
          text: `❌ Account \`@${username}\` not found.`,
        });
        return;
      }

      // Parse quoted times (supporting both straight and smart quotes)
      const timeRegex = /["“”]([^"“”]+)["“”]/g;
      let match;
      const parsedTimes: { original: string, formatted: string }[] = [];
      const invalidTimes: string[] = [];

      while ((match = timeRegex.exec(timesStr)) !== null) {
        const t = match[1];
        const formatted = this.parseTime12to24(t);
        if (formatted) {
          parsedTimes.push({ original: t, formatted });
        } else {
          invalidTimes.push(t);
        }
      }

      if (parsedTimes.length === 0) {
        await this.webClient.chat.postMessage({
          channel,
          text: `❌ No valid times found. Make sure to use quotes like \`"8:00 AM"\`.`,
        });
        return;
      }

      const supabase = this.supabaseService.getClient();
      
      // Get existing slots to ignore duplicates
      const { data: existingSlots } = await supabase
        .from('posting_slots')
        .select('id, slot_time')
        .eq('account_id', account.id);

      const existingTimes = new Set((existingSlots || []).map(s => s.slot_time));

      const processed: string[] = [];
      const ignored: string[] = [];

      if (action === 'add') {
        const toInsert: { account_id: number; slot_time: string }[] = [];
        for (const pt of parsedTimes) {
          if (existingTimes.has(pt.formatted)) {
            ignored.push(pt.original);
          } else {
            toInsert.push({ account_id: account.id, slot_time: pt.formatted });
            processed.push(pt.original);
            existingTimes.add(pt.formatted); // prevent internal duplicates in the same command
          }
        }

        if (toInsert.length > 0) {
          await supabase.from('posting_slots').insert(toInsert);
        }

        await this.schedulerService.reshuffleQueue(account.id);

        let msg = `✅ Slots updated for \`@${username}\`.\n*Added*: ${processed.length > 0 ? processed.join(', ') : 'None'}.`;
        if (ignored.length > 0) msg += `\n*Ignored (already exists)*: ${ignored.join(', ')}.`;
        if (invalidTimes.length > 0) msg += `\n*Invalid format*: ${invalidTimes.join(', ')}.`;

        await this.webClient.chat.postMessage({ channel, text: msg });
        return;

      } else {
        // action === 'remove'
        const toDelete: string[] = [];
        for (const pt of parsedTimes) {
          if (existingTimes.has(pt.formatted)) {
            toDelete.push(pt.formatted);
            processed.push(pt.original);
          } else {
            ignored.push(pt.original);
          }
        }

        if (toDelete.length > 0) {
          await supabase
            .from('posting_slots')
            .delete()
            .eq('account_id', account.id)
            .in('slot_time', toDelete);
        }

        await this.schedulerService.reshuffleQueue(account.id);

        let msg = `🗑️ Slots removed for \`@${username}\`.\n*Removed*: ${processed.length > 0 ? processed.join(', ') : 'None'}.`;
        if (ignored.length > 0) msg += `\n*Not found*: ${ignored.join(', ')}.`;
        if (invalidTimes.length > 0) msg += `\n*Invalid format*: ${invalidTimes.join(', ')}.`;

        await this.webClient.chat.postMessage({ channel, text: msg });
        return;
      }

    } catch (error) {
      this.logger.error(`Failed to execute slot command for @${username}`, error instanceof Error ? error.stack : String(error));
      await this.webClient.chat.postMessage({
        channel,
        text: `❌ Failed to update slots for \`@${username}\`.`,
      });
    }
  }

  private parseTime12to24(timeStr: string): string | null {
    const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (!match) return null;
    let [ , hStr, mStr, period ] = match;
    let hours = parseInt(hStr, 10);
    const minutes = mStr || '00';
    if (hours < 1 || hours > 12) return null;
    if (period.toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }

  /**
   * Parses the @username from the beginning of a caption.
   *
   * Input:  "@football_edits Here is the new reel!"
   * Output: { username: "football_edits", caption: "Here is the new reel!" }
   *
   * Input:  "No username here"
   * Output: { username: null, caption: "No username here" }
   */
  private parseCaption(text: string): {
    username: string | null;
    caption: string;
  } {
    const match = text.match(/^@(\S+)\s*([\s\S]*)$/);

    if (!match) {
      return { username: null, caption: text };
    }

    return {
      username: match[1],
      caption: match[2]?.trim() || '',
    };
  }

  /**
   * Looks up an account by username in the database.
   */
  private async lookupAccount(
    username: string,
  ): Promise<{ id: number; username: string } | null> {
    const supabase = this.supabaseService.getClient();
    // Strip leading @ so lookup works regardless of how accounts were stored
    const clean = username.startsWith('@') ? username.slice(1) : username;

    // Safe parameterised query — no string concatenation into filter
    let { data } = await supabase
      .from('accounts')
      .select('id, username')
      .eq('username', clean)
      .maybeSingle();

    // Fallback: try with @ prefix for any older records
    if (!data) {
      const fallback = await supabase
        .from('accounts')
        .select('id, username')
        .eq('username', `@${clean}`)
        .maybeSingle();
      data = fallback.data;
    }

    return data as { id: number; username: string } | null;
  }

  /**
   * Sends an error message to a Slack channel, mentioning the user.
   */
  private async sendSlackError(
    channel: string,
    userId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.webClient.chat.postMessage({
        channel,
        text: `<@${userId}> ${message}`,
      });
    } catch (err) {
      this.logger.error(
        'Failed to send error message to Slack.',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async handleAnalyticsCommand(channel: string): Promise<void> {
    try {
      const overview = await this.analyticsService.getOverview();
      
      const blocks: any[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 System Analytics Overview',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Global Metrics*\nPending: ${overview.global.total_pending} | Published: ${overview.global.total_published} | Failed: ${overview.global.total_failed}`,
          },
        },
        { type: 'divider' },
      ];

      for (const acc of overview.accounts) {
        const healthEmoji = acc.failed > 0 ? '🔴' : acc.queue_status === 'paused' ? '⏸️' : '🟢';
        let runwayText = 'None';
        if (acc.runway) {
          const date = new Date(acc.runway);
          runwayText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${healthEmoji} *@${acc.username}*\nStatus: \`${acc.queue_status}\` | Daily Slots: ${acc.total_slots}\nActive Slots: ${(acc as any).slot_times && (acc as any).slot_times.length > 0 ? (acc as any).slot_times.join(', ') : 'None'}\nPending: ${acc.pending} | Published: ${acc.published} | Failed: ${acc.failed}\nQueue Runway: *Runs out on ${runwayText}*`,
          },
        });
      }

      await this.webClient.chat.postMessage({
        channel,
        text: 'System Analytics Overview',
        blocks,
      });
    } catch (error) {
      this.logger.error('Failed to handle analytics command', error instanceof Error ? error.stack : String(error));
      await this.webClient.chat.postMessage({
        channel,
        text: '❌ Failed to fetch analytics overview.',
      });
    }
  }

  private async handleQueueToggleCommand(channel: string, username: string, status: 'active' | 'paused'): Promise<void> {
    try {
      const account = await this.lookupAccount(username);
      if (!account) {
        await this.webClient.chat.postMessage({
          channel,
          text: `❌ Account \`@${username}\` not found.`,
        });
        return;
      }

      const supabase = this.supabaseService.getClient();
      const { error } = await supabase
        .from('accounts')
        .update({ queue_status: status })
        .eq('id', account.id);

      if (error) throw error;

      let extraMsg = '';
      if (status === 'active') {
        await this.schedulerService.reshuffleQueue(account.id);
        extraMsg = ' and queue was successfully reshuffled';
      }

      const emoji = status === 'active' ? '🟢' : '⏸️';
      await this.webClient.chat.postMessage({
        channel,
        text: `${emoji} Queue for \`@${username}\` has been set to *${status}*${extraMsg}.`,
      });
    } catch (error) {
      this.logger.error(`Failed to handle queue toggle command for @${username}`, error instanceof Error ? error.stack : String(error));
      await this.webClient.chat.postMessage({
        channel,
        text: `❌ Failed to update queue status for \`@${username}\`.`,
      });
    }
  }
}
