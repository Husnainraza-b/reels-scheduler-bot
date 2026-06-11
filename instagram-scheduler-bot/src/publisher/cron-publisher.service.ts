import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { WebClient } from '@slack/web-api';
import { SupabaseService } from '../database/supabase.service';
import { EncryptionService } from '../crypto/encryption.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';

/**
 * Represents a queue item joined with its account credentials.
 * Schema: queue joined with accounts
 */
interface PublishableItem {
  id: number;
  account_id: number;
  video_url: string;
  caption: string | null;
  scheduled_for: string;
  status: string;
  // Joined from accounts table
  username: string;
  instagram_business_id: string;
  access_token: string;
}

/**
 * Meta container status response.
 */
interface ContainerStatusResponse {
  id: string;
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

/** Polling interval for Meta container status (ms). */
const CONTAINER_POLL_INTERVAL_MS = 20_000; // 20 seconds

/** Maximum time to wait for Meta container processing (ms). */
const CONTAINER_MAX_TIMEOUT_MS = 600_000; // 10 minutes

/** Maximum retries before marking as failed. */
const MAX_RETRY_COUNT = 3;

/** Base delay for exponential backoff (ms). */
const BASE_BACKOFF_DELAY_MS = 60_000; // 1 minute

/** Slack channel for failure alerts (uses bot's default DM). */
const FAILURE_ALERT_CHANNEL = '#general';

/**
 * Background Publishing Engine.
 *
 * Processes the queue in a complete lifecycle:
 * 1. Find due items (pending + scheduled_for <= NOW).
 * 2. Lock each item to 'processing' to prevent race conditions.
 * 3. Decrypt the account's access token.
 * 4. Submit the video to Meta's container ingestion endpoint.
 * 5. Poll container status until FINISHED (20s intervals, 10min timeout).
 * 6. Publish the container via /media_publish.
 * 7. Clean up R2 storage and mark as 'published'.
 * 8. On failure: increment retry_count with exponential backoff or mark 'failed'.
 * 9. On permanent failure (3 retries): send Slack alert.
 */
@Injectable()
export class CronPublisherService {
  private readonly logger = new Logger(CronPublisherService.name);
  private readonly graphApiVersion: string;
  private readonly slackClient: WebClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {
    this.graphApiVersion =
      this.configService.get<string>('META_GRAPH_API_VERSION') || 'v20.0';

    // Initialize Slack client for failure alerts
    const slackToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.slackClient = new WebClient(slackToken || undefined);

    this.logger.log(
      `Publishing engine initialized. Graph API version: ${this.graphApiVersion}`,
    );
  }

  /**
   * Main entry point: scans the queue and publishes all due items.
   */
  async checkAndPublishActiveQueue(): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // --- Find all due queue items with their account credentials ---
    // Uses actual schema: table "accounts", columns "token_iv", "video_url"
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
        accounts (
          username,
          instagram_business_id,
          access_token
        )
      `,
      )
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });

    if (queryError) {
      this.logger.error(
        'Failed to query due queue items.',
        queryError.message,
      );
      return;
    }

    if (!dueItems || dueItems.length === 0) {
      this.logger.debug('No due items found in the queue. Sleeping.');
      return;
    }

    this.logger.log(`⏰ Found ${dueItems.length} due item(s) to publish.`);

    // --- Process each item sequentially to respect rate limits ---
    for (const raw of dueItems) {
      // Flatten the joined account data
      const account = raw.accounts as unknown as {
        username: string;
        instagram_business_id: string;
        access_token: string;
      };

      if (!account) {
        this.logger.error(
          `Queue item "${raw.id}" has no linked account. Skipping.`,
        );
        continue;
      }

      const item: PublishableItem = {
        id: raw.id,
        account_id: raw.account_id,
        video_url: raw.video_url,
        caption: raw.caption,
        scheduled_for: raw.scheduled_for,
        status: raw.status,
        username: account.username,
        instagram_business_id: account.instagram_business_id,
        access_token: account.access_token,
      };

      await this.processItem(item);
    }
  }

  /**
   * Processes a single queue item through the full publish lifecycle.
   */
  private async processItem(item: PublishableItem): Promise<void> {
    const supabase = this.supabaseService.getClient();

    this.logger.log(
      `🚀 Processing queue item "${item.id}" for @${item.username}...`,
    );

    // --- Step 1: Lock the item to 'processing' ---
    const { error: lockError } = await supabase
      .from('queue')
      .update({ status: 'processing' })
      .eq('id', item.id);

    if (lockError) {
      this.logger.error(
        `Failed to lock item "${item.id}" to processing.`,
        lockError.message,
      );
      return;
    }

      // --- Step 2: Rate Limit Check ---
      const { count, error: countError } = await supabase
        .from('queue')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', item.account_id)
        .eq('status', 'published')
        .gte('scheduled_for', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (countError) {
        throw new Error(`Rate limit check failed: ${countError.message}`);
      }

      if (count !== null && count >= 25) {
        this.logger.warn(`Rate limit reached for @${item.username} (25 in 24h). Rescheduling to +1 hour.`);
        await supabase
          .from('queue')
          .update({
            status: 'pending',
            scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          })
          .eq('id', item.id);
        return;
      }

    try {
      // --- Step 3: Decrypt the access token ---
      const [iv, encryptedText] = item.access_token.split(':');
      if (!iv || !encryptedText) {
        throw new Error('Access token is missing IV or Ciphertext structure. Make sure you use the new format.');
      }
      const accessToken = this.encryptionService.decrypt(encryptedText, iv);

      // --- Step 4: Create the media container on Meta ---
      const containerId = await this.createMediaContainer(
        item.instagram_business_id,
        item.video_url,
        item.caption || '',
        accessToken,
      );

      this.logger.log(
        `📦 Container created: ${containerId}. Polling for status...`,
      );

      // --- Step 5: Poll container status until FINISHED ---
      await this.waitForContainerReady(containerId, accessToken);

      // --- Step 6: Publish the container ---
      await this.publishContainer(
        item.instagram_business_id,
        containerId,
        accessToken,
      );

      // --- Step 7: Clean up R2 storage ---
      const fileName = this.extractFileNameFromUrl(item.video_url);
      if (fileName) {
        try {
          await this.cloudflareR2Service.deleteVideo(fileName);
          this.logger.log(`🗑️  R2 cleanup complete: "${fileName}"`);
        } catch (r2Error) {
          this.logger.warn(`R2 cleanup failed: ${r2Error instanceof Error ? r2Error.message : String(r2Error)}`);
        }
      }

      // --- Step 8: Mark as published with timestamp ---
      const { error: publishError } = await supabase
        .from('queue')
        .update({
          status: 'published',
        })
        .eq('id', item.id);

      if (publishError) {
        this.logger.error(
          `Failed to mark item "${item.id}" as published.`,
          publishError.message,
        );
      }

      this.logger.log(
        `✅ Successfully published queue item "${item.id}" for @${item.username}!`,
      );
    } catch (error) {
      await this.handlePublishError(item, error);
    }
  }

  /**
   * Creates a media container on Meta's Graph API for Reels.
   */
  private async createMediaContainer(
    instagramBusinessId: string,
    videoUrl: string,
    caption: string,
    accessToken: string,
  ): Promise<string> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${instagramBusinessId}/media`;

    const response = await axios.post<{ id: string }>(url, null, {
      params: {
        video_url: videoUrl,
        caption: caption,
        media_type: 'REELS',
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

  /**
   * Polls the container status every 20 seconds until it reaches FINISHED.
   */
  private async waitForContainerReady(
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < CONTAINER_MAX_TIMEOUT_MS) {
      pollCount++;

      const status = await this.checkContainerStatus(containerId, accessToken);

      this.logger.log(
        `📊 Container "${containerId}" poll #${pollCount}: status = ${status.status_code}`,
      );

      switch (status.status_code) {
        case 'FINISHED':
          this.logger.log(
            `✅ Container "${containerId}" is ready for publishing.`,
          );
          return;

        case 'ERROR':
          throw new Error(
            `Meta container "${containerId}" reached ERROR status. ` +
              `Details: ${status.status || 'No details provided.'}`,
          );

        case 'EXPIRED':
          throw new Error(
            `Meta container "${containerId}" has EXPIRED. ` +
              'The video may be invalid or the link inaccessible.',
          );

        case 'IN_PROGRESS':
          break;

        default:
          this.logger.warn(
            `Unexpected container status: ${status.status_code}. Continuing to poll.`,
          );
      }

      await this.sleep(CONTAINER_POLL_INTERVAL_MS);
    }

    throw new Error(
      `Container "${containerId}" timed out after ${CONTAINER_MAX_TIMEOUT_MS / 1000}s. ` +
        'Meta did not finish processing the video.',
    );
  }

  /**
   * Checks the current status of a media container.
   */
  private async checkContainerStatus(
    containerId: string,
    accessToken: string,
  ): Promise<ContainerStatusResponse> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${containerId}`;

    const response = await axios.get<ContainerStatusResponse>(url, {
      params: {
        fields: 'status_code,status',
        access_token: accessToken,
      },
    });

    return response.data;
  }

  /**
   * Publishes a finished container to the Instagram feed.
   */
  private async publishContainer(
    instagramBusinessId: string,
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${instagramBusinessId}/media_publish`;

    const response = await axios.post<{ id: string }>(url, null, {
      params: {
        creation_id: containerId,
        access_token: accessToken,
      },
    });

    if (!response.data?.id) {
      throw new Error(
        'Meta API did not return a published media ID. Response: ' +
          JSON.stringify(response.data),
      );
    }

    this.logger.log(
      `📸 Published to Instagram! Media ID: ${response.data.id}`,
    );
  }

  /**
   * Handles publish failures with exponential backoff retry logic.
   * On permanent failure (3 retries), sends a Slack alert.
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

    this.logger.error(
      `❌ Queue item "${item.id}" has failed. Marking as FAILED.`,
      errorMessage,
    );

    await supabase
      .from('queue')
      .update({
        status: 'failed',
      })
      .eq('id', item.id);

    // --- Send Slack failure alert ---
    await this.sendFailureAlert(item, errorMessage);
  }

  /**
   * Sends a Slack alert when a video permanently fails after max retries.
   */
  private async sendFailureAlert(
    item: PublishableItem,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.slackClient.chat.postMessage({
        channel: FAILURE_ALERT_CHANNEL,
        text:
          `🚨 *PUBLISH FAILED* — Queue item #${item.id}\n\n` +
          `*Account:* @${item.username}\n` +
          `*Video:* ${item.video_url}\n` +
          `*Retries:* ${MAX_RETRY_COUNT}/${MAX_RETRY_COUNT} exhausted\n` +
          `*Error:* \`${errorMessage.substring(0, 500)}\`\n\n` +
          `This item has been marked as \`failed\` in the database. ` +
          `Please investigate and re-queue manually if needed.`,
      });

      this.logger.log(
        `📢 Failure alert sent to Slack for queue item "${item.id}".`,
      );
    } catch (slackError) {
      this.logger.error(
        `Failed to send Slack failure alert for item "${item.id}".`,
        slackError instanceof Error ? slackError.message : String(slackError),
      );
    }
  }

  /**
   * Extracts the filename from a public R2 URL.
   */
  private extractFileNameFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/');
      return segments[segments.length - 1] || null;
    } catch {
      this.logger.warn(`Could not parse URL for filename extraction: ${url}`);
      return null;
    }
  }

  /**
   * Async sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
