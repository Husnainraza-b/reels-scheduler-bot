import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../database/supabase.service';
import { ConfigService } from '@nestjs/config';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import axios from 'axios';

@Injectable()
export class VerificationPollerService {
  private readonly logger = new Logger(VerificationPollerService.name);
  private readonly graphApiVersion: string;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION') || 'v20.0';
  }

  @Cron('*/5 * * * *')
  async pollVerifyingItems() {
    this.logger.log('🔍 Polling for verifying items...');
    const supabase = this.supabaseService.getClient();

    const { data: queueItems, error } = await supabase
      .from('queue')
      .select(`
        *,
        accounts:account_id (
          username,
          access_token
        )
      `)
      .eq('status', 'verifying');

    if (error || !queueItems || queueItems.length === 0) {
      return;
    }

    for (const item of queueItems) {
      const accessToken = item.accounts?.access_token;
      if (!accessToken) continue;

      const metadata = item.platform_metadata || {};
      const publishedPlatforms = new Set<string>(item.published_platforms || []);
      const failures: string[] = [];

      let hasVerifying = false;

      for (const platform of Object.keys(metadata)) {
        const platformData = metadata[platform];
        if (platformData.status !== 'verifying') continue;

        try {
          const url = `https://graph.facebook.com/${this.graphApiVersion}/${platformData.media_id}`;
          const res = await axios.get(url, {
            params: { fields: 'status_code,status', access_token: accessToken },
          });

          const status = res.data.status_code || res.data.status?.video_status;

          if (status === 'FINISHED' || status === 'published' || status === 'ready') {
            platformData.status = 'published';
            publishedPlatforms.add(platform);
          } else if (status === 'ERROR' || status === 'error') {
            platformData.status = 'error';
            failures.push(`[${platform.toUpperCase()}] Meta Error: ${res.data.status}`);
          } else {
            // Still verifying
            hasVerifying = true;
          }
        } catch (err: any) {
          this.logger.error(`Failed to poll ${platform} for item ${item.id}`, err.message);
          hasVerifying = true; // Retry later
        }
      }

      // Determine new overall status
      const allEnabledPlatforms = ['instagram', 'facebook', 'tiktok', 'x', 'youtube'].filter((p) => (item.platforms_enabled as any)[p]);
      const allPublished = allEnabledPlatforms.every((p) => publishedPlatforms.has(p));

      let newStatus = item.status;
      if (failures.length > 0) {
        newStatus = 'failed';
      } else if (allPublished) {
        newStatus = 'published';
      } else if (!hasVerifying) {
        // If no failures, no verifying, but not all published? 
        // Means some platforms were disabled or pending? 
        // If it was verifying, it was only verifying those that needed it.
        // It shouldn't get here unless it reverts to pending for some reason, or failed.
        // If it's a mix of published and pending, it's 'pending'.
        newStatus = 'pending';
      }

      await supabase
        .from('queue')
        .update({
          status: newStatus,
          published_platforms: Array.from(publishedPlatforms),
          platform_metadata: metadata,
          ...(allPublished ? { published_at: new Date().toISOString() } : {}),
        })
        .eq('id', item.id);

      // Clean up R2 if published
      if (allPublished) {
        const fileName = this.extractFileNameFromUrl(item.video_url);
        if (fileName) {
          try {
            await this.cloudflareR2Service.deleteVideo(fileName);
          } catch { }
        }
      }

      // Optionally send Slack alert if failures
      if (failures.length > 0) {
        // You'd inject Slack client here, or just let the main retry/error handler do it.
        // For now, it marks as failed. The main cron picks up failed? No, main cron picks up pending.
        // If we want it to retry, we set status to 'pending' and increment retry. 
        // For simplicity, we just mark as failed here to be safe, or we let the main logic handle it if we set it back to pending.
        this.logger.error(`Verification failed for item ${item.id}: ${failures.join(' | ')}`);
      }
    }
  }

  private extractFileNameFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/');
      return parts[parts.length - 1];
    } catch {
      return null;
    }
  }
}
