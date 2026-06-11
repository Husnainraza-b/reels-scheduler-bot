import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import axios from 'axios';
import { Readable } from 'stream';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SupabaseService } from '../database/supabase.service';
import { SchedulerService } from '../scheduler/scheduler.service';

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
    if (!event.files || event.files.length === 0) {
      this.logger.warn('processIncomingFile called with no files. Skipping.');
      return;
    }

    // --- Step 1: Parse @username from caption ---
    const rawCaption = event.text?.trim() || '';
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
        `❌ *Error:* Account \`@${username}\` was not found in the system.\n\n` +
          'Please check the username and try again, or add the account via the dashboard first.',
      );
      return;
    }

    this.logger.log(
      `🎯 Tenant routed: @${username} → account_id: ${account.id}`,
    );

    // --- Step 3: Process each file ---
    for (const file of event.files) {
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

        let publicUrl;
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

        await this.sendSlackError(
          event.channel,
          event.user,
          `❌ *Error processing file:* \`${originalName}\`\n\n` +
            `\`${error instanceof Error ? error.message : String(error)}\``,
        );
      }
    }
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
    const cleanUsername = username.startsWith('@') ? username.slice(1) : username;

    const { data, error } = await supabase
      .from('accounts')
      .select('id, username')
      .or(`username.eq.${cleanUsername},username.eq.@${cleanUsername}`)
      .single();

    if (error || !data) {
      return null;
    }

    return data as { id: number; username: string };
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
}
