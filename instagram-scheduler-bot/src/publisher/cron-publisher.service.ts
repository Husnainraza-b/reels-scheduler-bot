import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { WebClient } from '@slack/web-api';
import { SupabaseService } from '../database/supabase.service';
import { EncryptionService } from '../crypto/encryption.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SchedulerService } from '../scheduler/scheduler.service';

interface PublishableItem {
  id: number;
  account_id: number;
  video_url: string;
  caption: string | null;
  scheduled_for: string;
  status: string;
  retry_count: number;
  // Joined from accounts table
  username: string;
  instagram_business_id: string;
  access_token: string;
}

interface ContainerStatusResponse {
  id: string;
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

const CONTAINER_POLL_INTERVAL_MS = 20_000;   // 20 seconds between polls
const CONTAINER_MAX_TIMEOUT_MS   = 600_000;  // 10 minute hard timeout
const MAX_RETRY_COUNT            = 3;        // attempts before reschedule
const BASE_BACKOFF_DELAY_MS      = 300_000;  // 5 minutes base backoff
const RATE_LIMIT_POSTS_PER_DAY   = 25;       // Meta daily limit

@Injectable()
export class CronPublisherService {
  private readonly logger = new Logger(CronPublisherService.name);
  private readonly graphApiVersion: string;
  private readonly slackClient: WebClient;
  private readonly alertChannel: string;

  // Concurrency guard — prevents parallel publisher runs
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly schedulerService: SchedulerService,
  ) {
    this.graphApiVersion =
      this.configService.get<string>('META_GRAPH_API_VERSION') || 'v20.0';

    const slackToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.slackClient  = new WebClient(slackToken || undefined);

    // Alert channel from env — defaults to #general if not set
    this.alertChannel =
      this.configService.get<string>('SLACK_ALERT_CHANNEL') || '#general';

    this.logger.log(
      `Publishing engine initialised. Graph API: ${this.graphApiVersion}`,
    );
  }

  /**
   * Main entry point triggered by POST /api/cron/publish.
   * Concurrency guard ensures only one run executes at a time.
   */
  async checkAndPublishActiveQueue(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Publisher already running — skipping duplicate trigger.');
      return;
    }

    this.isRunning = true;

    try {
      await this.recoverStuckItems();
      await this.runPublishLoop();
      await this.cleanupOldPublishedItems();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Cleanup step: deletes any queue items that were published more than 30 days ago.
   * This keeps the Supabase database clean and well within the free tier limits.
   */
  private async cleanupOldPublishedItems(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('queue')
      .delete()
      .eq('status', 'published')
      .lt('published_at', thirtyDaysAgo);

    if (error) {
      this.logger.warn(`Failed to clean up old published items: ${error.message}`);
    } else {
      this.logger.debug('Old published items cleanup completed successfully.');
    }
  }

  /**
   * Recovery step: any item stuck in 'rescheduling' for >10 minutes
   * (from a crashed reshuffle) is reset to 'pending' so it re-enters
   * the normal queue flow.
   */
  private async recoverStuckItems(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('queue')
      .update({ status: 'pending' })
      .eq('status', 'rescheduling')
      .lt('updated_at', tenMinutesAgo);

    if (error) {
      this.logger.warn(`Stuck-item recovery query failed: ${error.message}`);
    }
  }

  /**
   * Scans for due items and processes each one sequentially.
   */
  private async runPublishLoop(): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: dueItems, error: queryError } = await supabase
      .from('queue')
      .select(
        `
        id,
        account_id,
        video_url,
        caption,
        scheduled_for,
        status,
        retry_count,
        accounts (
          username,
          instagram_business_id,
          access_token,
          queue_status
        )
      `,
      )
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });

    if (queryError) {
      this.logger.error('Failed to query due queue items.', queryError.message);
      return;
    }

    if (!dueItems || dueItems.length === 0) {
      this.logger.debug('No due items found. Sleeping.');
      return;
    }

    this.logger.log(`⏰ Found ${dueItems.length} due item(s) to publish.`);

    for (const raw of dueItems) {
      const account = raw.accounts as unknown as {
        username: string;
        instagram_business_id: string;
        access_token: string;
        queue_status: string;
      };

      if (!account) {
        this.logger.error(
          `Queue item "${raw.id}" has no linked account. Skipping.`,
        );
        continue;
      }

      if (account.queue_status === 'paused') {
        this.logger.debug(
          `Account "@${account.username}" is paused. Skipping item "${raw.id}".`,
        );
        continue;
      }

      const item: PublishableItem = {
        id:                     raw.id,
        account_id:             raw.account_id,
        video_url:              raw.video_url,
        caption:                raw.caption,
        scheduled_for:          raw.scheduled_for,
        status:                 raw.status,
        retry_count:            raw.retry_count ?? 0,
        username:               account.username,
        instagram_business_id:  account.instagram_business_id,
        access_token:           account.access_token,
      };

      await this.processItem(item);
    }
  }

  /**
   * Full publish lifecycle for one queue item.
   */
  private async processItem(item: PublishableItem): Promise<void> {
    const supabase = this.supabaseService.getClient();

    this.logger.log(
      `🚀 Processing item "${item.id}" for @${item.username}...`,
    );

    // Lock to 'processing' immediately to prevent double-processing
    const { error: lockError } = await supabase
      .from('queue')
      .update({ status: 'processing' })
      .eq('id', item.id)
      .eq('status', 'pending'); // only lock if still pending (safety check)

    if (lockError) {
      this.logger.error(
        `Failed to lock item "${item.id}".`,
        lockError.message,
      );
      return;
    }

    try {
      // Rate limit check — uses published_at (when it actually went live)
      const { count, error: countError } = await supabase
        .from('queue')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', item.account_id)
        .eq('status', 'published')
        .gte(
          'published_at',
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        );

      if (countError) {
        throw new Error(`Rate limit check failed: ${countError.message}`);
      }

      if (count !== null && count >= RATE_LIMIT_POSTS_PER_DAY) {
        this.logger.warn(
          `Rate limit hit for @${item.username} (${count} in 24h). Rescheduling +1 hour.`,
        );
        await supabase
          .from('queue')
          .update({
            status:        'pending',
            scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          })
          .eq('id', item.id);
        return;
      }

      // Decrypt the access token
      const [iv, encryptedText] = item.access_token.split(':');
      if (!iv || !encryptedText) {
        throw new Error(
          'Malformed access token (missing IV:ciphertext format). ' +
          'Re-save the account credentials via the dashboard.',
        );
      }
      const accessToken = this.encryptionService.decrypt(encryptedText, iv);

      // Create Meta container
      const containerId = await this.createMediaContainer(
        item.instagram_business_id,
        item.video_url,
        item.caption || '',
        accessToken,
      );

      this.logger.log(`📦 Container created: ${containerId}. Polling...`);

      // Poll until FINISHED (hard 10-minute timeout)
      await this.waitForContainerReady(containerId, accessToken);

      // Publish
      await this.publishContainer(
        item.instagram_business_id,
        containerId,
        accessToken,
      );

      // R2 cleanup — only after confirmed publish
      const fileName = this.extractFileNameFromUrl(item.video_url);
      if (fileName) {
        try {
          await this.cloudflareR2Service.deleteVideo(fileName);
          this.logger.log(`🗑️  R2 cleanup complete: "${fileName}"`);
        } catch (r2Error) {
          this.logger.warn(
            `R2 cleanup failed (non-critical): ${r2Error instanceof Error ? r2Error.message : String(r2Error)}`,
          );
        }
      }

      // Mark published with actual timestamp
      await supabase
        .from('queue')
        .update({
          status:       'published',
          published_at: new Date().toISOString(),  // ← critical for rate limit accuracy
        })
        .eq('id', item.id);

      this.logger.log(
        `✅ Published item "${item.id}" for @${item.username}!`,
      );

      try {
        await this.slackClient.chat.postMessage({
          channel: this.alertChannel,
          text: `🎉 *SUCCESSFULLY PUBLISHED* 🚀\n\n*Account:* @${item.username}\n*Video:* \`${fileName || 'video.mp4'}\`\n*Queue Item ID:* #${item.id}\n\nThe reel is now live on Instagram!`,
        });
      } catch (slackError) {
        this.logger.error('Failed to send success alert to Slack', slackError instanceof Error ? slackError.message : String(slackError));
      }
    } catch (error) {
      await this.handlePublishError(item, error);
    }
  }

  /**
   * RESILIENT FAILURE HANDLER
   *
   * Flow:
   *   Attempt 1–3: retry with exponential backoff (5min, 10min, 15min)
   *   After 3 failures: reschedule to next available slot via Gap Finder
   *                     (retry_count resets to 0 — fresh start at new time)
   *   If Gap Finder also fails (no slots): mark permanently failed + alert
   *
   * This means a video NEVER dies permanently unless there are truly
   * no posting slots configured for the account.
   */
  private async handlePublishError(
    item: PublishableItem,
    error: unknown,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const errorMessage =
      error instanceof AxiosError
        ? `HTTP ${error.response?.status}: ${JSON.stringify(error.response?.data)}`
        : error instanceof Error
          ? error.message
          : String(error);

    const newRetryCount = item.retry_count + 1;

    this.logger.error(
      `❌ Item "${item.id}" failed (attempt ${newRetryCount}/${MAX_RETRY_COUNT}).`,
      errorMessage,
    );

    if (newRetryCount < MAX_RETRY_COUNT) {
      // ─── Still within retry window — backoff and try again ───
      const backoffMs  = BASE_BACKOFF_DELAY_MS * newRetryCount; // 5min, 10min
      const retryAt    = new Date(Date.now() + backoffMs).toISOString();

      await supabase
        .from('queue')
        .update({
          status:        'pending',
          retry_count:   newRetryCount,
          error_message: errorMessage,
          scheduled_for: retryAt,
        })
        .eq('id', item.id);

      this.logger.warn(
        `🔄 Item "${item.id}" retry #${newRetryCount} scheduled for ${retryAt}`,
      );

      // Send failure alert on every attempt
      try {
        await this.slackClient.chat.postMessage({
          channel: this.alertChannel,
          text:
            `⚠️ *PUBLISH FAILED (Attempt ${newRetryCount}/${MAX_RETRY_COUNT})* — Queue item #${item.id}\n\n` +
            `*Account:* @${item.username}\n` +
            `*Error:* \`${errorMessage.substring(0, 300)}\`\n\n` +
            `Will retry at ${retryAt}.`,
        });
      } catch (slackError) {
        this.logger.error('Failed to send retry alert', slackError instanceof Error ? slackError.message : String(slackError));
      }
    } else {
      // ─── Max retries hit — reshuffle queue to next slot ───
      this.logger.warn(
        `⚠️  Item "${item.id}" exhausted ${MAX_RETRY_COUNT} retries. ` +
        `Reshuffling queue to move to next slot...`,
      );

      try {
        // Reset item to pending and retry_count to 0 so it participates in the reshuffle
        const { error: resetError } = await supabase
          .from('queue')
          .update({
            status:        'pending',
            retry_count:   0,
            error_message:
              `Rescheduled after ${MAX_RETRY_COUNT} failed attempts. ` +
              `Last error: ${errorMessage.substring(0, 300)}`,
          })
          .eq('id', item.id);

        if (resetError) {
          throw new Error(`Failed to reset item to pending: ${resetError.message}`);
        }

        // Call the strict Lift and Restack logic to bump everything down
        await this.schedulerService.reshuffleQueue(item.account_id);

        // Fetch its newly assigned slot to include in the alert
        const { data: updatedItem } = await supabase
          .from('queue')
          .select('scheduled_for')
          .eq('id', item.id)
          .single();

        const newSlot = updatedItem?.scheduled_for || 'Unknown slot';

        this.logger.log(
          `📅 Item "${item.id}" reshuffled to new slot: ${newSlot}`,
        );

        // Send a non-urgent reschedule alert (not a failure, just FYI)
        await this.sendRescheduleAlert(item, errorMessage, newSlot);
      } catch (rescheduleError) {
        // ─── Reshuffle also failed ───
        // Only NOW do we permanently fail the item
        const rescheduleMsg =
          rescheduleError instanceof Error
            ? rescheduleError.message
            : String(rescheduleError);

        this.logger.error(
          `💀 Item "${item.id}" permanently failed — ` +
          `could not reshuffle: ${rescheduleMsg}`,
        );

        await supabase
          .from('queue')
          .update({
            status:        'failed',
            retry_count:   newRetryCount,
            error_message: `${errorMessage} | Reshuffle also failed: ${rescheduleMsg}`,
          })
          .eq('id', item.id);

        await this.sendFailureAlert(item, errorMessage);
      }
    }
  }

  // ─── Meta API Methods ──────────────────────────────────────────────────────

  private async createMediaContainer(
    instagramBusinessId: string,
    videoUrl: string,
    caption: string,
    accessToken: string,
  ): Promise<string> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${instagramBusinessId}/media`;

    const response = await axios.post<{ id: string }>(url, null, {
      params: {
        video_url:   videoUrl,
        caption:     caption,
        media_type:  'REELS',
        access_token: accessToken,
      },
    });

    if (!response.data?.id) {
      throw new Error(
        'Meta API did not return a container ID. Response: ' +
          JSON.stringify(response.data),
      );
    }

    return response.data.id;
  }

  private async waitForContainerReady(
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const startTime = Date.now();
    let pollCount   = 0;

    while (Date.now() - startTime < CONTAINER_MAX_TIMEOUT_MS) {
      pollCount++;
      const status = await this.checkContainerStatus(containerId, accessToken);

      this.logger.log(
        `📊 Container "${containerId}" poll #${pollCount}: ${status.status_code}`,
      );

      switch (status.status_code) {
        case 'FINISHED':
          return;
        case 'ERROR':
          throw new Error(
            `Meta container "${containerId}" ERROR: ${status.status || 'no details'}`,
          );
        case 'EXPIRED':
          throw new Error(
            `Meta container "${containerId}" EXPIRED — video may be invalid or R2 URL inaccessible.`,
          );
        case 'IN_PROGRESS':
        default:
          break;
      }

      await this.sleep(CONTAINER_POLL_INTERVAL_MS);
    }

    throw new Error(
      `Container "${containerId}" timed out after ${CONTAINER_MAX_TIMEOUT_MS / 1000}s.`,
    );
  }

  private async checkContainerStatus(
    containerId: string,
    accessToken: string,
  ): Promise<ContainerStatusResponse> {
    const url      = `https://graph.facebook.com/${this.graphApiVersion}/${containerId}`;
    const response = await axios.get<ContainerStatusResponse>(url, {
      params: { fields: 'status_code,status', access_token: accessToken },
    });
    return response.data;
  }

  private async publishContainer(
    instagramBusinessId: string,
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${instagramBusinessId}/media_publish`;

    const response = await axios.post<{ id: string }>(url, null, {
      params: { creation_id: containerId, access_token: accessToken },
    });

    if (!response.data?.id) {
      throw new Error(
        'Meta API did not return a published media ID. Response: ' +
          JSON.stringify(response.data),
      );
    }

    this.logger.log(`📸 Published to Instagram! Media ID: ${response.data.id}`);
  }

  // ─── Slack Alerts ─────────────────────────────────────────────────────────

  private async sendRescheduleAlert(
    item: PublishableItem,
    errorMessage: string,
    newSlot: string,
  ): Promise<void> {
    try {
      await this.slackClient.chat.postMessage({
        channel: this.alertChannel,
        text:
          `⚠️ *PUBLISH RESCHEDULED* — Queue item #${item.id}\n\n` +
          `*Account:* @${item.username}\n` +
          `*New slot:* ${newSlot}\n` +
          `*Reason:* Failed ${MAX_RETRY_COUNT} attempts\n` +
          `*Last error:* \`${errorMessage.substring(0, 300)}\`\n\n` +
          `The video has been rescheduled and will retry automatically.`,
      });
    } catch (slackError) {
      this.logger.error(
        `Failed to send reschedule alert for item "${item.id}".`,
        slackError instanceof Error ? slackError.message : String(slackError),
      );
    }
  }

  private async sendFailureAlert(
    item: PublishableItem,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.slackClient.chat.postMessage({
        channel: this.alertChannel,
        text:
          `🚨 *PERMANENT FAILURE* — Queue item #${item.id}\n\n` +
          `*Account:* @${item.username}\n` +
          `*Video:* ${item.video_url}\n` +
          `*Error:* \`${errorMessage.substring(0, 500)}\`\n\n` +
          `This item is marked \`failed\`. No posting slots may be configured. ` +
          `Please investigate via the dashboard.`,
      });
    } catch (slackError) {
      this.logger.error(
        `Failed to send failure alert for item "${item.id}".`,
        slackError instanceof Error ? slackError.message : String(slackError),
      );
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private extractFileNameFromUrl(url: string): string | null {
    try {
      const parsed   = new URL(url);
      const segments = parsed.pathname.split('/');
      return segments[segments.length - 1] || null;
    } catch {
      this.logger.warn(`Could not parse URL for filename: ${url}`);
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
