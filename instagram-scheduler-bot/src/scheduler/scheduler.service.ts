import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';

const FREEZE_GUARD_MINUTES = 15;

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
    const { data: scheduledForUtc, error: rpcError } = await supabase
      .rpc('calculate_next_slot', { p_account_id: accountId });

    if (rpcError) {
      this.logger.error(`Gap Finder RPC failed for account ${accountId}`, rpcError.message);
      throw new Error(`Failed to calculate next slot: ${rpcError.message}`);
    }

    if (!scheduledForUtc) {
      throw new Error('Gap finder returned null slot.');
    }

    // 2. Insert into queue
    const { data, error } = await supabase
      .from('queue')
      .insert({
        account_id: accountId,
        video_url: videoUrl,
        caption: caption || null,
        scheduled_for: scheduledForUtc,
        status: 'pending',
        slack_file_id: slackFileId || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to insert queue record for account ${accountId}`, error.message);
      throw new Error(`Failed to insert queue record: ${error.message}`);
    }

    this.logger.log(
      `📅 Queued video for account "${accountId}" → ` +
        `scheduled_for: ${scheduledForUtc} | video: ${videoUrl}`,
    );

    return data;
  }

  /**
   * Reshuffles all pending queue items outside the freeze guard window.
   */
  async reshuffleQueue(accountId: number | string): Promise<{ reshuffled: number; frozen: number }> {
    const supabase = this.supabaseService.getClient();
    const now = new Date();
    const freezeBarrier = new Date(now.getTime() + FREEZE_GUARD_MINUTES * 60 * 1000);

    const { data: pendingItems, error: fetchError } = await supabase
      .from('queue')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchError) {
      this.logger.error(`Failed to fetch pending queue for reshuffle.`, fetchError.message);
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!pendingItems || pendingItems.length === 0) {
      return { reshuffled: 0, frozen: 0 };
    }

    const frozenItems = pendingItems.filter((item) => new Date(item.scheduled_for) <= freezeBarrier);
    const shiftableItems = pendingItems.filter((item) => new Date(item.scheduled_for) > freezeBarrier);

    frozenItems.forEach(item => {
      this.logger.log(`Freeze guard: item #${item.id} locked at ${item.scheduled_for}, skipping`);
    });

    if (shiftableItems.length === 0) {
      return { reshuffled: 0, frozen: frozenItems.length };
    }

    // Clear old schedule assignments
    const shiftableIds = shiftableItems.map((item) => item.id);
    await supabase
      .from('queue')
      .update({ status: 'rescheduling' })
      .in('id', shiftableIds);

    let reshuffledCount = 0;

    for (const item of shiftableItems) {
      try {
        const { data: newSlot, error: rpcError } = await supabase
          .rpc('calculate_next_slot', { p_account_id: accountId });

        if (rpcError || !newSlot) throw new Error(rpcError?.message || 'Null slot returned');

        await supabase
          .from('queue')
          .update({
            scheduled_for: newSlot,
            status: 'pending',
          })
          .eq('id', item.id);

        reshuffledCount++;
        this.logger.log(`✅ Reshuffled item #${item.id} → ${newSlot}`);
      } catch (error) {
        this.logger.error(`Failed to calculate new slot for item #${item.id}. Restoring.`, error instanceof Error ? error.stack : String(error));
        await supabase
          .from('queue')
          .update({ status: 'pending' })
          .eq('id', item.id);
      }
    }

    return { reshuffled: reshuffledCount, frozen: frozenItems.length };
  }
}
