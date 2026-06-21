import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

interface CreateSlotDto {
  slot_time: string;
}

interface UpdateSlotDto {
  slot_time: string;
}

interface SlotResponse {
  id: number;
  account_id: number;
  slot_time: string;
}

@Controller('dashboard')
@UseGuards(AdminAuthGuard)
export class SlotsController {
  private readonly logger = new Logger(SlotsController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly schedulerService: SchedulerService,
  ) {}

  @Get('accounts/:accountId/slots')
  async getSlots(
    @Param('accountId') accountId: string,
  ): Promise<SlotResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('posting_slots')
      .select('id, account_id, slot_time')
      .eq('account_id', accountId)
      .order('slot_time', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch slots for account ${accountId}.`,
        error.message,
      );
      throw new BadRequestException({
        error: `Failed to fetch slots: ${error.message}`,
        code: 'FETCH_FAILED',
      });
    }

    return (data || []) as SlotResponse[];
  }

  @Post('accounts/:accountId/slots')
  @HttpCode(HttpStatus.CREATED)
  async createSlot(
    @Param('accountId') accountId: string,
    @Body() body: CreateSlotDto,
  ) {
    const { slot_time } = body;

    if (!slot_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(slot_time)) {
      throw new BadRequestException({
        error: 'slot_time must be in "HH:MM" or "HH:MM:SS" format',
        code: 'INVALID_FORMAT',
      });
    }

    const normalizedTime =
      slot_time.length === 5 ? `${slot_time}:00` : slot_time;
    const supabase = this.supabaseService.getClient();

    // Check duplicate
    const { data: existing } = await supabase
      .from('posting_slots')
      .select('id')
      .eq('account_id', accountId)
      .eq('slot_time', normalizedTime)
      .single();

    if (existing) {
      throw new ConflictException({
        error: 'This slot already exists for this account',
        code: 'SLOT_DUPLICATE',
      });
    }

    const { data, error } = await supabase
      .from('posting_slots')
      .insert({ account_id: accountId, slot_time: normalizedTime })
      .select('id, account_id, slot_time')
      .single();

    if (error) {
      this.logger.error('Failed to create slot.', error.message);
      throw new BadRequestException({
        error: `Failed to create slot: ${error.message}`,
        code: 'CREATE_FAILED',
      });
    }

    this.logger.log(
      `✅ Slot created for account ${accountId}: ${normalizedTime}. Reshuffling...`,
    );

    let reshuffled = 0;
    let frozen = 0;
    try {
      const res = await this.schedulerService.reshuffleQueue(accountId);
      reshuffled = res.reshuffled;
      frozen = res.frozen;
    } catch (e) {
      this.logger.warn(
        `Queue reshuffle failed.`,
        e instanceof Error ? e.message : String(e),
      );
    }

    return { slot: data as SlotResponse, reshuffled, frozen };
  }

  @Delete('slots/:slotId')
  @HttpCode(HttpStatus.OK)
  async deleteSlot(@Param('slotId') slotId: string) {
    const supabase = this.supabaseService.getClient();

    // First get accountId for reshuffle
    const { data: slotData } = await supabase
      .from('posting_slots')
      .select('account_id')
      .eq('id', slotId)
      .single();

    if (!slotData) {
      throw new BadRequestException({
        error: 'Slot not found',
        code: 'NOT_FOUND',
      });
    }

    const { error } = await supabase
      .from('posting_slots')
      .delete()
      .eq('id', slotId);

    if (error) {
      this.logger.error('Failed to delete slot.', error.message);
      throw new BadRequestException({
        error: `Failed to delete slot: ${error.message}`,
        code: 'DELETE_FAILED',
      });
    }

    this.logger.log(`🗑️ Slot ${slotId} deleted. Reshuffling queue...`);

    let reshuffled = 0;
    let frozen = 0;
    try {
      const res = await this.schedulerService.reshuffleQueue(
        slotData.account_id,
      );
      reshuffled = res.reshuffled;
      frozen = res.frozen;
    } catch (e) {
      this.logger.warn(
        `Queue reshuffle failed.`,
        e instanceof Error ? e.message : String(e),
      );
    }

    return { reshuffled, frozen };
  }

  @Patch('slots/:slotId')
  @HttpCode(HttpStatus.OK)
  async updateSlot(
    @Param('slotId') slotId: string,
    @Body() body: UpdateSlotDto,
  ) {
    const { slot_time } = body;

    if (!slot_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(slot_time)) {
      throw new BadRequestException({
        error: 'slot_time must be in "HH:MM" or "HH:MM:SS" format',
        code: 'INVALID_FORMAT',
      });
    }

    const normalizedTime =
      slot_time.length === 5 ? `${slot_time}:00` : slot_time;
    const supabase = this.supabaseService.getClient();

    // First get accountId
    const { data: slotData } = await supabase
      .from('posting_slots')
      .select('account_id')
      .eq('id', slotId)
      .single();

    if (!slotData) {
      throw new BadRequestException({
        error: 'Slot not found',
        code: 'NOT_FOUND',
      });
    }

    // Check duplicate
    const { data: existing } = await supabase
      .from('posting_slots')
      .select('id')
      .eq('account_id', slotData.account_id)
      .eq('slot_time', normalizedTime)
      .single();

    if (existing && existing.id.toString() !== slotId) {
      throw new ConflictException({
        error: 'This slot already exists for this account',
        code: 'SLOT_DUPLICATE',
      });
    }

    const { data, error } = await supabase
      .from('posting_slots')
      .update({ slot_time: normalizedTime })
      .eq('id', slotId)
      .select('id, account_id, slot_time')
      .single();

    if (error) {
      this.logger.error('Failed to update slot.', error.message);
      throw new BadRequestException({
        error: `Failed to update slot: ${error.message}`,
        code: 'UPDATE_FAILED',
      });
    }

    this.logger.log(`🔄 Slot ${slotId} updated. Reshuffling queue...`);

    let reshuffled = 0;
    let frozen = 0;
    try {
      const res = await this.schedulerService.reshuffleQueue(
        slotData.account_id,
      );
      reshuffled = res.reshuffled;
      frozen = res.frozen;
    } catch (e) {
      this.logger.warn(
        `Queue reshuffle failed.`,
        e instanceof Error ? e.message : String(e),
      );
    }

    return { slot: data as SlotResponse, reshuffled, frozen };
  }
}
