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
import { SnapchatPublisher } from './platforms/snapchat.publisher';

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
    private readonly snapchatPublisher: SnapchatPublisher,
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
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Delete MP4 from R2 for permanently failed items older than 2 days
    const { data: r2CleanupItems } = await supabase
      .from('queue')
      .select('id, video_url')
      .eq('status', 'failed')
      .not('video_url', 'is', null)
      .lt('updated_at', twoDaysAgo);

    if (r2CleanupItems && r2CleanupItems.length > 0) {
      for (const item of r2CleanupItems) {
        if (item.video_url) {
          const fileName = this.extractFileNameFromUrl(item.video_url);
          if (fileName) {
            try {
              await this.cloudflareR2Service.deleteVideo(fileName);
              // Mark the video_url as null so we don't try to delete it again
              await supabase.from('queue').update({ video_url: null }).eq('id', item.id);
            } catch (err) {}
          }
        }
      }
    }

    // 2. Delete the database rows entirely for permanently failed items older than 30 days
    await supabase
      .from('queue')
      .delete()
      .eq('status', 'failed')
      .lt('updated_at', thirtyDaysAgo);
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
        id, account_id, video_url, caption, scheduled_for, status, retry_count, published_platforms,
        accounts (
          username, platforms_enabled, instagram_business_id, facebook_page_id,
          access_token, tiktok_access_token, twitter_access_token, twitter_access_secret, youtube_refresh_token, snapchat_access_token,
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
        published_platforms: raw.published_platforms || [],
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
      if (account.snapchat_access_token) item.snapchat_access_token = this.decryptToken(account.snapchat_access_token);

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
      // Set of already published platforms
      const published = new Set(item.published_platforms);
      const tasks: Promise<{ platform: string; status: 'fulfilled' | 'rejected'; reason?: any; verifying?: boolean; media_id?: string }>[] = [];
      const attemptedPlatforms: string[] = [];

      if (item.platforms_enabled.instagram && !published.has('instagram')) {
        tasks.push(this.instagramPublisher.publish(item).then((res: any) => ({ platform: 'instagram', status: 'fulfilled' as const, verifying: res?.status === 'verifying', media_id: res?.media_id })).catch((err) => ({ platform: 'instagram', status: 'rejected' as const, reason: err })));
        attemptedPlatforms.push('Instagram');
      }
      if (item.platforms_enabled.facebook && !published.has('facebook')) {
        tasks.push(this.facebookPublisher.publish(item).then((res: any) => ({ platform: 'facebook', status: 'fulfilled' as const, verifying: res?.status === 'verifying', media_id: res?.media_id })).catch((err) => ({ platform: 'facebook', status: 'rejected' as const, reason: err })));
        attemptedPlatforms.push('Facebook');
      }
      if (item.platforms_enabled.tiktok && !published.has('tiktok')) {
        tasks.push(this.tiktokPublisher.publish(item).then(() => ({ platform: 'tiktok', status: 'fulfilled' as const })).catch((err) => ({ platform: 'tiktok', status: 'rejected' as const, reason: err })));
        attemptedPlatforms.push('TikTok');
      }
      if (item.platforms_enabled.x && !published.has('x')) {
        tasks.push(this.twitterPublisher.publish(item).then(() => ({ platform: 'x', status: 'fulfilled' as const })).catch((err) => ({ platform: 'x', status: 'rejected' as const, reason: err })));
        attemptedPlatforms.push('X');
      }
      if (item.platforms_enabled.youtube && !published.has('youtube')) {
        tasks.push(this.youtubePublisher.publish(item).then(() => ({ platform: 'youtube', status: 'fulfilled' as const })).catch((err) => ({ platform: 'youtube', status: 'rejected' as const, reason: err })));
        attemptedPlatforms.push('YouTube');
      }
      if (item.platforms_enabled.snapchat && !published.has('snapchat')) {
        tasks.push(this.snapchatPublisher.publish(item).then(() => ({ platform: 'snapchat', status: 'fulfilled' as const })).catch((err) => ({ platform: 'snapchat', status: 'rejected' as const, reason: err })));
        attemptedPlatforms.push('Snapchat');
      }

      // If there's nothing to attempt, this means either no platforms enabled, or all are already published.
      // But if it was stuck in pending/processing, we should just consider it fully published.
      if (tasks.length === 0) {
        attemptedPlatforms.push('None (already published to all enabled)');
      }

      // Wait for all newly attempted platforms to finish
      const results = await Promise.all(tasks);

      const newPublished = new Set(published);
      const failures: { platform: string; reason: any }[] = [];
      const newVerifying: Record<string, any> = item.platform_metadata || {};
      let hasVerifying = false;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.verifying && result.media_id) {
            newVerifying[result.platform] = { media_id: result.media_id, status: 'verifying' };
            hasVerifying = true;
          } else {
            newPublished.add(result.platform);
          }
        } else {
          failures.push({ platform: result.platform, reason: result.reason });
        }
      }

      const allEnabledPlatforms = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'snapchat'].filter((p) => (item.platforms_enabled as any)[p]);
      const allPublished = allEnabledPlatforms.every((p) => newPublished.has(p));

      if (failures.length > 0) {
        // If there are failures, save the newly successful platforms to DB, then throw error to trigger retry
        await supabase
          .from('queue')
          .update({ 
            published_platforms: Array.from(newPublished),
            platform_metadata: newVerifying 
          })
          .eq('id', item.id);
        
        // Update the item in memory so handlePublishError knows what succeeded
        item.published_platforms = Array.from(newPublished);

        const errorMessages = failures.map((f) => `[${f.platform.toUpperCase()}] ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`);
        const err = new Error(errorMessages.join(' | '));
        (err as any).failedPlatforms = failures.map((f) => f.platform).join(', ');
        throw err;
      }

      // If we reach here, ALL newly attempted platforms succeeded (either published or verifying)!
      // Delete from R2 only if ALL enabled platforms are now successfully published AND there are no verifying platforms
      if (allPublished && !hasVerifying) {
        const fileName = this.extractFileNameFromUrl(item.video_url);
        if (fileName) {
          try {
            await this.cloudflareR2Service.deleteVideo(fileName);
          } catch (r2Error) {}
        }
      }

      await supabase
        .from('queue')
        .update({
          status: hasVerifying ? 'verifying' : (allPublished ? 'published' : 'pending'),
          published_platforms: Array.from(newPublished),
          platform_metadata: newVerifying,
          published_at: (allPublished && !hasVerifying) ? new Date().toISOString() : null,
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

    const failedPlatformsText = (error as any)?.failedPlatforms ? `\n*Failed On:* ${(error as any).failedPlatforms}` : '';
    const successPlatformsText = item.published_platforms && item.published_platforms.length > 0 ? `\n*Succeeded On:* ${item.published_platforms.join(', ')}` : '';

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
          text: `⚠️ *PUBLISH FAILED (Attempt ${newRetryCount}/${MAX_RETRY_COUNT})* — Queue item #${item.id}\n\n*Account:* @${item.username}${failedPlatformsText}${successPlatformsText}\n*Error:* \`${errorMessage.substring(0, 300)}\`\n\nWill retry at ${retryAt}.`,
        });
      } catch {}
    } else {
      await supabase
        .from('queue')
        .update({
          status: 'pending',
          retry_count: 0,
          error_message: `Rescheduled after ${MAX_RETRY_COUNT} consecutive attempts. Last error: ${errorMessage.substring(0, 300)}`,
        })
        .eq('id', item.id);

      try {
        await this.schedulerService.reshuffleQueue(item.account_id);
      } catch (reshuffleError) {
        this.logger.error(`Failed to trigger Lift and Restack for account ${item.account_id} after standard failures`, reshuffleError);
      }

      try {
        await this.slackClient.chat.postMessage({
          channel: this.alertChannel,
          text: `🔄 *PUBLISH RESCHEDULED* — Queue item #${item.id}\n\n*Account:* @${item.username}${failedPlatformsText}${successPlatformsText}\n*Error:* \`${errorMessage.substring(0, 500)}\`\n\nThis item has exhausted its consecutive retries and has been pushed back into the active queue. The remaining schedule has been automatically reshuffled.`,
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
