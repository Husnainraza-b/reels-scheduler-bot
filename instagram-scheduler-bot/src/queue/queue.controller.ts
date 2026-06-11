import { Controller, Get, Param, Logger, BadRequestException, UseGuards } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

interface QueueItemResponse {
  id: number;
  account_id: number;
  video_url: string;
  caption: string | null;
  scheduled_for: string;
  status: string;
  retry_count: number;
  error_message: string | null;
  slack_file_id: string | null;
  published_at: string | null;
  created_at: string;
}

@Controller('dashboard/accounts')
@UseGuards(AdminAuthGuard)
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  @Get(':id/queue')
  async getQueue(@Param('id') accountId: string): Promise<QueueItemResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('queue')
      .select('*')
      .eq('account_id', accountId)
      .in('status', ['pending', 'processing', 'rescheduling'])
      .order('scheduled_for', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch pending queue for account ${accountId}.`, error.message);
      throw new BadRequestException({ error: `Failed to fetch queue: ${error.message}`, code: 'FETCH_FAILED' });
    }

    return (data || []) as QueueItemResponse[];
  }

  @Get(':id/queue/all')
  async getFullQueue(@Param('id') accountId: string): Promise<QueueItemResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('queue')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch full queue for account ${accountId}.`, error.message);
      throw new BadRequestException({ error: `Failed to fetch queue: ${error.message}`, code: 'FETCH_FAILED' });
    }

    return (data || []) as QueueItemResponse[];
  }
}
