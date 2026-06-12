import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SchedulerService } from '../scheduler/scheduler.service';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly schedulerService: SchedulerService,
  ) {}

  /**
   * Updates the caption of a specific queue item.
   */
  async updateCaption(id: number | string, caption: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('queue')
      .update({ caption: caption || null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update caption for video #${id}: ${error.message}`);
      throw new BadRequestException(`Failed to update caption: ${error.message}`);
    }

    return data;
  }

  /**
   * Deletes a queue item, cleans up R2 storage, and reshuffles remaining pending items.
   */
  async deleteAndReshuffle(id: number | string) {
    const supabase = this.supabaseService.getClient();

    // 1. Target: Fetch the video record from Supabase
    const { data: item, error: fetchError } = await supabase
      .from('queue')
      .select('account_id, video_url, status')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      this.logger.error(`Queue item #${id} not found for deletion. Error: ${fetchError?.message}`);
      throw new NotFoundException(`Queue item #${id} not found.`);
    }

    // Guard: cannot delete an item that is actively being published
    if (item.status === 'processing') {
      throw new BadRequestException({
        error: 'Cannot delete a video that is currently being published. Wait a minute and try again.',
        code: 'ITEM_IS_PROCESSING',
      });
    }

    const { account_id: accountId, video_url: videoUrl } = item;

    // 2. Storage Cleanup: delete the video from R2
    const fileName = this.extractFileNameFromUrl(videoUrl);
    if (fileName) {
      try {
        await this.cloudflareR2Service.deleteVideo(fileName);
        this.logger.log(`🗑️  Successfully deleted R2 file: "${fileName}"`);
      } catch (s3Error) {
        this.logger.error(
          `Failed to delete R2 file "${fileName}" for queue item #${id}. Proceeding with DB cleanup.`,
          s3Error instanceof Error ? s3Error.stack : String(s3Error),
        );
      }
    }

    // 3. Database Cleanup: delete the queue row
    const { error: deleteError } = await supabase
      .from('queue')
      .delete()
      .eq('id', id);

    if (deleteError) {
      this.logger.error(`Failed to delete queue item #${id} from database: ${deleteError.message}`);
      throw new BadRequestException(`Failed to delete video row: ${deleteError.message}`);
    }
    this.logger.log(`✅ Queue item #${id} deleted from database.`);

    // 4. The Reshuffle: delegate to SchedulerService's strict Lift and Restack logic
    try {
      await this.schedulerService.reshuffleQueue(accountId);
    } catch (reshuffleError) {
      this.logger.warn(`Queue reshuffle failed after deleting item #${id}.`, reshuffleError instanceof Error ? reshuffleError.message : String(reshuffleError));
    }

    return { success: true };
  }

  /**
   * Helper to extract the filename from a URL.
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
}
