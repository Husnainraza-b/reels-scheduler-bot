import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';

export interface AccountAnalytics {
  username: string;
  queue_status: string;
  total_slots: number;
  slot_times: string[];
  pending: number;
  published: number;
  failed: number;
  runway: string | null;
}

export interface AnalyticsOverview {
  global: {
    total_pending: number;
    total_published: number;
    total_failed: number;
  };
  accounts: AccountAnalytics[];
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async getOverview(): Promise<AnalyticsOverview> {
    const supabase = this.supabaseService.getClient();

    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('id, username, queue_status');

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    const { data: queueData, error: queueError } = await supabase
      .from('queue')
      .select('account_id, status, scheduled_for');

    if (queueError) {
      throw new Error(`Failed to fetch queue: ${queueError.message}`);
    }

    const { data: slotsData, error: slotsError } = await supabase
      .from('posting_slots')
      .select('account_id, slot_time');

    if (slotsError) {
      throw new Error(`Failed to fetch slots: ${slotsError.message}`);
    }

    const overview: AnalyticsOverview = {
      global: { total_pending: 0, total_published: 0, total_failed: 0 },
      accounts: [],
    };

    if (!accountsData) return overview;

    for (const acc of accountsData) {
      const accountQueue = (queueData || []).filter(
        (q) => q.account_id === acc.id,
      );
      const accountSlots = (slotsData || []).filter(
        (s) => s.account_id === acc.id,
      );

      const pendingItems = accountQueue.filter((q) => q.status === 'pending');
      const published = accountQueue.filter(
        (q) => q.status === 'published',
      ).length;
      const failed = accountQueue.filter((q) => q.status === 'failed').length;
      const pending = pendingItems.length;

      let runway: string | null = null;
      const validPendingItems = pendingItems.filter(
        (item) => !item.scheduled_for.includes('2099'),
      );
      if (validPendingItems.length > 0) {
        const maxDate = validPendingItems.reduce((max, item) => {
          const itemDate = new Date(item.scheduled_for);
          return itemDate > max ? itemDate : max;
        }, new Date(0));
        runway = maxDate.toISOString();
      }

      overview.global.total_pending += pending;
      overview.global.total_published += published;
      overview.global.total_failed += failed;

      overview.accounts.push({
        username: acc.username,
        queue_status: acc.queue_status || 'active',
        total_slots: accountSlots.length,
        slot_times: accountSlots.map((s) => s.slot_time).sort(),
        pending,
        published,
        failed,
        runway,
      });
    }

    return overview;
  }
}
