import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Logger,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { QueueService } from './queue.service';

interface QueueItemResponse {
  id: number;
  account_id: number;
  video_url: string;
  caption: string | null;
  scheduled_for: string;
  status: string;
  slack_file_id: string | null;
  created_at: string;
  is_manual?: boolean;
}

@Controller()
@UseGuards(AdminAuthGuard)
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly queueService: QueueService,
  ) {}

  @Get('dashboard/accounts/:id/queue')
  async getQueue(@Param('id') accountId: string): Promise<QueueItemResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('queue')
      .select('*')
      .eq('account_id', accountId)
      .in('status', ['pending', 'processing', 'rescheduling', 'failed'])
      .order('scheduled_for', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch pending queue for account ${accountId}.`,
        error.message,
      );
      throw new BadRequestException({
        error: `Failed to fetch queue: ${error.message}`,
        code: 'FETCH_FAILED',
      });
    }

    return (data || []) as QueueItemResponse[];
  }

  @Get('dashboard/accounts/:id/queue/all')
  async getFullQueue(
    @Param('id') accountId: string,
  ): Promise<QueueItemResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('queue')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to fetch full queue for account ${accountId}.`,
        error.message,
      );
      throw new BadRequestException({
        error: `Failed to fetch queue: ${error.message}`,
        code: 'FETCH_FAILED',
      });
    }

    return (data || []) as QueueItemResponse[];
  }

  @Patch('queue/:id/caption')
  async editCaption(
    @Param('id') id: string,
    @Body() body: { caption: string },
  ) {
    if (body.caption === undefined) {
      throw new BadRequestException(
        'caption field is required in request body.',
      );
    }
    return this.queueService.updateCaption(id, body.caption);
  }

  @Patch('queue/:id/schedule')
  async scheduleItem(
    @Param('id') id: string,
    @Body() body: { scheduled_for: string },
  ) {
    if (!body.scheduled_for) {
      throw new BadRequestException(
        'scheduled_for field is required in request body.',
      );
    }
    return this.queueService.scheduleItem(id, body.scheduled_for);
  }

  @Patch('queue/:id/swap')
  async swapItem(
    @Param('id') id: string,
    @Body() body: { direction: 'up' | 'down' },
  ) {
    if (body.direction !== 'up' && body.direction !== 'down') {
      throw new BadRequestException(
        'direction field must be "up" or "down".',
      );
    }
    return this.queueService.swapItem(id, body.direction);
  }

  @Delete('queue/:id')
  async deleteItem(@Param('id') id: string) {
    return this.queueService.deleteAndReshuffle(id);
  }
}
