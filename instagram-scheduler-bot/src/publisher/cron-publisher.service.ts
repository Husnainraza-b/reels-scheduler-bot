import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { SupabaseService } from '../database/supabase.service';
import { EncryptionService } from '../crypto/encryption.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { PublishableItem } from './platforms/platform-publisher.interface';
import { InstagramPublisher } from './platforms/instagram.publisher';
import { FacebookPublisher } from './platforms/facebook.publisher';
import { TiktokPublisher } from './platforms/tiktok.publisher';
import { TwitterPublisher } from './platforms/x.publisher';
import { YoutubePublisher } from './platforms/youtube.publisher';

const MAX_RETRY_COUNT = 3;
const BASE_BACKOFF_DELAY_MS = 300_000;
const RATE_LIMIT_POSTS_PER_DAY = 25;

@Injectable()
export class CronPublisherService {
  private readonly logger = new Logger(CronPublisherService.name);
  private readonly slackClient: WebClient;
  private readonly alertChannel: string;

  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly schedulerService: SchedulerService,
    // Inject Publishers
    private readonly instagramPublisher: InstagramPublisher,
    private readonly facebookPublisher: FacebookPublisher,
    private readonly tiktokPublisher: TiktokPublisher,
    private readonly twitterPublisher: TwitterPublisher,
    private readonly youtubePublisher: YoutubePublisher,
  ) {
    const slackToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.slackClient = new WebClient(slackToken || undefined);
    this.alertChannel = this.configService.get<string>('SLACK_ALERT_CHANNEL') || '#general';

    this.logger.log('Publishing engine initialized with Multi-Platform Support.');
  }

  async checkAndPublishActiveQueue(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.recoverStuckItems();
      await this.runPublishLoop();
      await this.cleanupOldPublishedItems();
      await this.cleanupOldFailedItems();
    } finally {
      this.isRunning = false;
    }
  }

  private async cleanupOldPublishedItems(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('queue').delete().eq('status', 'published').lt('published_at', thirtyDaysAgo);
  }

  private async cleanupOldFailedItems(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldFailedItems } = await supabase
      .from('queue')
      .select('id, video_url')
      .eq('status', 'pending')
      .eq('scheduled_for', '2099-12-31T23:59:59.000Z')
      .lt('updated_at', sevenDaysAgo);

    if (oldFailedItems && oldFailedItems.length > 0) {
      for (const item of oldFailedItems) {
        if (item.video_url) {
          const fileName = this.extractFileNameFromUrl(item.video_url);
          if (fileName) {
            try {
              await this.cloudflareR2Service.deleteVideo(fileName);
            } catch (err) {}
          }
        }
      }
      const ids = oldFailedItems.map((i) => i.id);
      await supabase.from('queue').delete().in('id', ids);
    }
  }

  private async recoverStuckItems(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase.from('queue').update({ status: 'pending' }).eq('status', 'processing').lt('updated_at', tenMinutesAgo);
  }

  private async runPublishLoop(): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: dueItems, error: queryError } = await supabase
      .from('queue')
      .select(`
        id, account_id, video_url, caption, scheduled_for, status, retry_count,
        accounts (
          username, platforms_enabled, instagram_business_id, facebook_page_id,
          access_token, tiktok_access_token, twitter_access_token, twitter_access_secret, youtube_refresh_token,
          queue_status
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });

    if (queryError || !dueItems || dueItems.length === 0) return;

    for (const raw of dueItems) {
      const account = raw.accounts as any;
      if (!account || account.queue_status === 'paused') continue;

      const item: PublishableItem = {
        id: raw.id,
        account_id: raw.account_id,
        video_url: raw.video_url,
        caption: raw.caption,
        scheduled_for: raw.scheduled_for,
        status: raw.status,
        retry_count: raw.retry_count ?? 0,
        username: account.username,
        platforms_enabled: account.platforms_enabled || { instagram: true },
        instagram_business_id: account.instagram_business_id,
        facebook_page_id: account.facebook_page_id,
      };

      // Decrypt tokens safely
      if (account.access_token) item.access_token = this.decryptToken(account.access_token);
      if (account.tiktok_access_token) item.tiktok_access_token = this.decryptToken(account.tiktok_access_token);
      if (account.twitter_access_token) item.twitter_access_token = this.decryptToken(account.twitter_access_token);
      if (account.twitter_access_secret) item.twitter_access_secret = this.decryptToken(account.twitter_access_secret);
      if (account.youtube_refresh_token) item.youtube_refresh_token = this.decryptToken(account.youtube_refresh_token);

      await this.processItem(item);
    }
  }

  private decryptToken(dbValue: string): string | undefined {
    try {
      const [iv, encryptedText] = dbValue.split(':');
      if (!iv || !encryptedText) return undefined;
      return this.encryptionService.decrypt(encryptedText, iv);
    } catch {
      return undefined;
    }
  }

  private async processItem(item: PublishableItem): Promise<void> {
    const supabase = this.supabaseService.getClient();

    this.logger.log(`🚀 Processing item "${item.id}" for @${item.username}...`);

    const { error: lockError } = await supabase
      .from('queue')
      .update({ status: 'processing' })
      .eq('id', item.id)
      .eq('status', 'pending');

    if (lockError) return;

    try {
      // Execute all enabled platform publishers concurrently
      const tasks: Promise<void>[] = [];
      const attemptedPlatforms: string[] = [];

      if (item.platforms_enabled.instagram) {
        tasks.push(this.instagramPublisher.publish(item));
        attemptedPlatforms.push('Instagram');
      }
      if (item.platforms_enabled.facebook) {
        tasks.push(this.facebookPublisher.publish(item));
        attemptedPlatforms.push('Facebook');
      }
      if (item.platforms_enabled.tiktok) {
        tasks.push(this.tiktokPublisher.publish(item));
        attemptedPlatforms.push('TikTok');
      }
      if (item.platforms_enabled.x) {
        tasks.push(this.twitterPublisher.publish(item));
        attemptedPlatforms.push('X');
      }
      if (item.platforms_enabled.youtube) {
        tasks.push(this.youtubePublisher.publish(item));
        attemptedPlatforms.push('YouTube');
      }

      // Wait for all to finish
      const results = await Promise.allSettled(tasks);

      const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      if (failures.length > 0) {
        const errorMessages = failures.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)));
        throw new Error(`Platforms failed: ${errorMessages.join(' | ')}`);
      }

      // Delete from R2 only if ALL succeed
      const fileName = this.extractFileNameFromUrl(item.video_url);
      if (fileName) {
        try {
          await this.cloudflareR2Service.deleteVideo(fileName);
        } catch (r2Error) {}
      }

      await supabase
        .from('queue')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      try {
        await this.slackClient.chat.postMessage({
          channel: this.alertChannel,
          text: `🎉 *SUCCESSFULLY PUBLISHED* 🚀\n\n*Account:* @${item.username}\n*Platforms:* ${attemptedPlatforms.join(', ')}\n*Queue Item ID:* #${item.id}`,
        });
      } catch {}

    } catch (error) {
      await this.handlePublishError(item, error);
    }
  }

  private async handlePublishError(item: PublishableItem, error: unknown): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const newRetryCount = item.retry_count + 1;

    this.logger.error(`❌ Item "${item.id}" failed (attempt ${newRetryCount}/${MAX_RETRY_COUNT}).`, errorMessage);

    if (newRetryCount < MAX_RETRY_COUNT) {
      const backoffMs = BASE_BACKOFF_DELAY_MS * newRetryCount;
      const retryAt = new Date(Date.now() + backoffMs).toISOString();

      await supabase
        .from('queue')
        .update({
          status: 'pending',
          retry_count: newRetryCount,
          error_message: errorMessage,
          scheduled_for: retryAt,
        })
        .eq('id', item.id);

      try {
        await this.slackClient.chat.postMessage({
          channel: this.alertChannel,
          text: `⚠️ *PUBLISH FAILED (Attempt ${newRetryCount}/${MAX_RETRY_COUNT})* — Queue item #${item.id}\n\n*Account:* @${item.username}\n*Error:* \`${errorMessage.substring(0, 300)}\`\n\nWill retry at ${retryAt}.`,
        });
      } catch {}
    } else {
      const unscheduledDate = '2099-12-31T23:59:59.000Z';
      await supabase
        .from('queue')
        .update({
          status: 'pending',
          retry_count: 0,
          scheduled_for: unscheduledDate,
          error_message: `Unscheduled after ${MAX_RETRY_COUNT} attempts. Last error: ${errorMessage.substring(0, 300)}`,
        })
        .eq('id', item.id);

      try {
        await this.slackClient.chat.postMessage({
          channel: this.alertChannel,
          text: `🚨 *PERMANENT FAILURE / UNSCHEDULED* — Queue item #${item.id}\n\n*Account:* @${item.username}\n*Error:* \`${errorMessage.substring(0, 500)}\`\n\nThis item is marked as Unscheduled (2099).`,
        });
      } catch {}
    }
  }

  private extractFileNameFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/');
      return segments[segments.length - 1] || null;
    } catch {
      return null;
    }
  }
}
