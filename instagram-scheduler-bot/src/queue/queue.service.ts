import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cloudflareR2Service: CloudflareR2Service,
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
      .select('account_id, video_url')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      this.logger.error(`Queue item #${id} not found for deletion. Error: ${fetchError?.message}`);
      throw new NotFoundException(`Queue item #${id} not found.`);
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

    // 4. The Reshuffle: fetch remaining pending videos for that account ordered by scheduled_for ASC
    const { data: remainingItems, error: queryError } = await supabase
      .from('queue')
      .select('id')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true });

    if (queryError) {
      this.logger.error(`Failed to query remaining queue items for account ${accountId}: ${queryError.message}`);
      throw new BadRequestException(`Failed to query remaining items: ${queryError.message}`);
    }

    if (remainingItems && remainingItems.length > 0) {
      const remainingIds = remainingItems.map(x => x.id);

      // Temporarily mark status to 'rescheduling' so Gap Finder RPC calculate_next_slot ignores their slots
      const { error: markError } = await supabase
        .from('queue')
        .update({ status: 'rescheduling' })
        .in('id', remainingIds);

      if (markError) {
        this.logger.error(`Failed to temporarily update items to rescheduling: ${markError.message}`);
        throw new BadRequestException(`Reshuffle failed during status preparation: ${markError.message}`);
      }

      for (const remainingItem of remainingItems) {
        try {
          // Calculate new earliest slot
          const { data: newSlot, error: rpcError } = await supabase
            .rpc('calculate_next_slot', { p_account_id: accountId });

          if (rpcError || !newSlot) {
            throw new Error(rpcError?.message || 'Gap Finder returned empty/null slot.');
          }

          // Update item to new slot and change status back to pending
          const { error: updateError } = await supabase
            .from('queue')
            .update({
              scheduled_for: newSlot,
              status: 'pending',
            })
            .eq('id', remainingItem.id);

          if (updateError) {
            throw new Error(`Failed to update scheduled_for: ${updateError.message}`);
          }

          this.logger.log(`🔄 Reshuffled video #${remainingItem.id} to new slot: ${newSlot}`);
        } catch (reshuffleError) {
          this.logger.error(
            `Failed to reshuffle video #${remainingItem.id}. Restoring status to pending.`,
            reshuffleError instanceof Error ? reshuffleError.stack : String(reshuffleError),
          );
          // Fallback recovery: reset status back to pending
          await supabase
            .from('queue')
            .update({ status: 'pending' })
            .eq('id', remainingItem.id);
        }
      }
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
