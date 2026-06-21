import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Calls the atomic Gap Finder RPC to get the next slot, and
   * inserts a new queue record.
   */
  async addToQueue(
    accountId: number | string,
    videoUrl: string,
    caption: string,
    slackFileId?: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // 1. Call RPC to get next available slot atomically
    const { data: scheduledForUtc, error: rpcError } = await supabase.rpc(
      'calculate_next_slot',
      { p_account_id: accountId },
    );

    let finalSlot = scheduledForUtc;
    if (rpcError) {
      if (rpcError.message?.includes('No posting slots configured')) {
        finalSlot = '2099-12-31T23:59:59.000Z';
      } else {
        this.logger.error(
          `Gap Finder RPC failed for account ${accountId}`,
          rpcError.message,
        );
        throw new Error(`Failed to calculate next slot: ${rpcError.message}`);
      }
    }

    // 2. Insert into queue
    const { data, error } = await supabase
      .from('queue')
      .insert({
        account_id: accountId,
        video_url: videoUrl,
        caption: caption || null,
        scheduled_for: finalSlot,
        status: 'pending',
        slack_file_id: slackFileId || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to insert queue record for account ${accountId}`,
        error.message,
      );
      throw new Error(`Failed to insert queue record: ${error.message}`);
    }

    this.logger.log(
      `📅 Queued video for account "${accountId}" → ` +
        `scheduled_for: ${scheduledForUtc} | video: ${videoUrl}`,
    );

    return data;
  }

  /**
   * Reshuffles all pending queue items using the strict Lift and Restack logic.
   */
  async reshuffleQueue(
    accountId: number | string,
  ): Promise<{ reshuffled: number; frozen: number }> {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch: Retrieve all videos for the account where status = 'pending', strictly ordered by created_at ASC
    const { data: pendingItems, error: fetchError } = await supabase
      .from('queue')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchError) {
      this.logger.error(
        `Failed to fetch pending queue for reshuffle.`,
        fetchError.message,
      );
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!pendingItems || pendingItems.length === 0) {
      return { reshuffled: 0, frozen: 0 };
    }

    // 2. Lift: Update status to 'calculating' so Gap Finder views schedule as empty
    const itemIds = pendingItems.map((item) => item.id);
    const { error: markError } = await supabase
      .from('queue')
      .update({ status: 'calculating' })
      .in('id', itemIds);

    if (markError) {
      this.logger.error(
        `Failed to temporarily update items to calculating: ${markError.message}`,
      );
      throw new Error(
        `Reshuffle failed during status preparation: ${markError.message}`,
      );
    }

    let reshuffledCount = 0;

    // 3. Restack: Loop through fetched videos one by one
    for (const item of pendingItems) {
      try {
        const { data: newSlot, error: rpcError } = await supabase.rpc(
          'calculate_next_slot',
          { p_account_id: accountId },
        );

        let finalSlot = newSlot;
        if (rpcError) {
          if (rpcError.message?.includes('No posting slots configured')) {
            finalSlot = '2099-12-31T23:59:59.000Z';
          } else {
            throw new Error(rpcError.message || 'Gap finder failed');
          }
        }

        const { error: updateError } = await supabase
          .from('queue')
          .update({
            scheduled_for: finalSlot,
            status: 'pending',
          })
          .eq('id', item.id);

        if (updateError) {
          throw new Error(`Failed to update item: ${updateError.message}`);
        }

        reshuffledCount++;
        this.logger.log(`✅ Reshuffled item #${item.id} → ${newSlot}`);
      } catch (error) {
        this.logger.error(
          `Failed to calculate new slot for item #${item.id}. Restoring.`,
          error instanceof Error ? error.stack : String(error),
        );
        await supabase
          .from('queue')
          .update({ status: 'pending' })
          .eq('id', item.id);
      }
    }

    return { reshuffled: reshuffledCount, frozen: 0 };
  }
}
