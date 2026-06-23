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
} from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import { EncryptionService } from '../crypto/encryption.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SchedulerService } from '../scheduler/scheduler.service';

interface PlatformsEnabled {
  instagram: boolean;
  facebook: boolean;
  tiktok: boolean;
  x: boolean;
  youtube: boolean;
}

interface CreateAccountDto {
  username: string;
  instagram_business_id?: string;
  facebook_page_id?: string;
  access_token?: string;
  tiktok_access_token?: string;
  twitter_access_token?: string;
  twitter_access_secret?: string;
  youtube_refresh_token?: string;
  platforms_enabled: PlatformsEnabled;
}

interface UpdateAccountDto {
  username?: string;
  instagram_business_id?: string;
  facebook_page_id?: string;
  access_token?: string;
  tiktok_access_token?: string;
  twitter_access_token?: string;
  twitter_access_secret?: string;
  youtube_refresh_token?: string;
  platforms_enabled?: PlatformsEnabled;
}

interface AccountResponse {
  id: number;
  username: string;
  instagram_business_id?: string;
  facebook_page_id?: string;
  platforms_enabled: PlatformsEnabled;
  created_at: string;
  queue_status: string;
}

@Controller('dashboard/accounts')
@UseGuards(AdminAuthGuard)
export class AccountsController {
  private readonly logger = new Logger(AccountsController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly schedulerService: SchedulerService,
  ) {}

  @Get()
  async getAccounts(): Promise<AccountResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .select('id, username, instagram_business_id, facebook_page_id, platforms_enabled, created_at, queue_status')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to fetch accounts.', error.message);
      throw new BadRequestException({
        error: `Failed to fetch accounts: ${error.message}`,
        code: 'FETCH_FAILED',
      });
    }

    return (data || []) as AccountResponse[];
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAccount(
    @Body() body: CreateAccountDto,
  ): Promise<AccountResponse> {
    const { 
      username, 
      platforms_enabled,
      instagram_business_id, 
      facebook_page_id,
      access_token,
      tiktok_access_token,
      twitter_access_token,
      twitter_access_secret,
      youtube_refresh_token
    } = body;

    let cleanUsername = username;
    if (cleanUsername && cleanUsername.startsWith('@')) {
      cleanUsername = cleanUsername.substring(1);
    }

    if (!cleanUsername) {
      throw new BadRequestException({
        error: 'username is required.',
        code: 'MISSING_FIELDS',
      });
    }

    const insertData: Record<string, any> = {
      username: cleanUsername,
      queue_status: 'active',
      platforms_enabled,
      instagram_business_id,
      facebook_page_id
    };

    if (access_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(access_token);
      insertData.access_token = `${iv}:${encryptedText}`;
    }
    if (tiktok_access_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(tiktok_access_token);
      insertData.tiktok_access_token = `${iv}:${encryptedText}`;
    }
    if (twitter_access_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(twitter_access_token);
      insertData.twitter_access_token = `${iv}:${encryptedText}`;
    }
    if (twitter_access_secret?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(twitter_access_secret);
      insertData.twitter_access_secret = `${iv}:${encryptedText}`;
    }
    if (youtube_refresh_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(youtube_refresh_token);
      insertData.youtube_refresh_token = `${iv}:${encryptedText}`;
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .insert(insertData)
      .select('id, username, instagram_business_id, facebook_page_id, platforms_enabled, created_at, queue_status')
      .single();

    if (error) {
      this.logger.error('Failed to create account.', error.message);
      throw new BadRequestException({
        error: `Failed to create account: ${error.message}`,
        code: 'CREATE_FAILED',
      });
    }

    this.logger.log(
      `✅ Account created: "${cleanUsername}" (${instagram_business_id})`,
    );
    return data as AccountResponse;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Param('id') id: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Fetch all queue items for this account to delete their videos from R2
    const { data: queueItems, error: fetchError } = await supabase
      .from('queue')
      .select('video_url')
      .eq('account_id', id);

    if (fetchError) {
      this.logger.warn(
        `Failed to fetch queue items for account ${id} before deletion. R2 videos might be orphaned.`,
        fetchError.message,
      );
    } else if (queueItems && queueItems.length > 0) {
      this.logger.log(
        `Found ${queueItems.length} queued videos for account ${id}. Deleting from R2...`,
      );
      for (const item of queueItems) {
        if (item.video_url) {
          const fileName = item.video_url.split('/').pop();
          if (fileName) {
            try {
              await this.cloudflareR2Service.deleteVideo(fileName);
            } catch (err) {
              this.logger.warn(
                `Could not delete video ${fileName} from R2 during account deletion. Skipping.`,
                err,
              );
            }
          }
        }
      }
    }

    // 2. Delete the account (which cascade-deletes the queue rows)
    const { error } = await supabase.from('accounts').delete().eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete account ${id}.`, error.message);
      throw new BadRequestException({
        error: `Failed to delete account: ${error.message}`,
        code: 'DELETE_FAILED',
      });
    }

    this.logger.log(`🗑️  Account "${id}" and all associated videos deleted.`);
    return { deleted: true };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateAccount(
    @Param('id') id: string,
    @Body() body: UpdateAccountDto,
  ): Promise<AccountResponse> {
    const { 
      username, 
      instagram_business_id, 
      facebook_page_id,
      access_token,
      tiktok_access_token,
      twitter_access_token,
      twitter_access_secret,
      youtube_refresh_token,
      platforms_enabled
    } = body;

    const updates: Record<string, any> = {};
    
    if (username !== undefined) {
      updates.username = username.startsWith('@') ? username.substring(1) : username;
    }
    if (instagram_business_id !== undefined) updates.instagram_business_id = instagram_business_id;
    if (facebook_page_id !== undefined) updates.facebook_page_id = facebook_page_id;
    if (platforms_enabled !== undefined) updates.platforms_enabled = platforms_enabled;

    if (access_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(access_token);
      updates.access_token = `${iv}:${encryptedText}`;
    }
    if (tiktok_access_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(tiktok_access_token);
      updates.tiktok_access_token = `${iv}:${encryptedText}`;
    }
    if (twitter_access_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(twitter_access_token);
      updates.twitter_access_token = `${iv}:${encryptedText}`;
    }
    if (twitter_access_secret?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(twitter_access_secret);
      updates.twitter_access_secret = `${iv}:${encryptedText}`;
    }
    if (youtube_refresh_token?.trim()) {
      const { encryptedText, iv } = this.encryptionService.encrypt(youtube_refresh_token);
      updates.youtube_refresh_token = `${iv}:${encryptedText}`;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException({
        error: 'No fields provided to update.',
        code: 'NO_UPDATES',
      });
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select('id, username, instagram_business_id, facebook_page_id, platforms_enabled, created_at, queue_status')
      .single();

    if (error) {
      this.logger.error(`Failed to update account ${id}.`, error.message);
      throw new BadRequestException({
        error: `Failed to update account: ${error.message}`,
        code: 'UPDATE_FAILED',
      });
    }

    this.logger.log(
      `🔄 Account updated: "${data.username}" (${data.instagram_business_id})`,
    );
    return data as AccountResponse;
  }

  @Post(':id/toggle-queue')
  @HttpCode(HttpStatus.OK)
  async toggleQueueStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'paused',
  ): Promise<AccountResponse> {
    if (status !== 'active' && status !== 'paused') {
      throw new BadRequestException({
        error: 'Invalid status',
        code: 'INVALID_STATUS',
      });
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .update({ queue_status: status })
      .eq('id', id)
      .select('id, username, instagram_business_id, facebook_page_id, platforms_enabled, created_at, queue_status')
      .single();

    if (error) {
      this.logger.error(
        `Failed to toggle queue for account ${id}.`,
        error.message,
      );
      throw new BadRequestException({
        error: `Failed to toggle queue: ${error.message}`,
        code: 'UPDATE_FAILED',
      });
    }

    this.logger.log(
      `🔄 Account queue toggled: "${data.username}" -> ${status}`,
    );

    if (status === 'active') {
      try {
        await this.schedulerService.reshuffleQueue(id);
      } catch (err) {
        this.logger.error(
          `Failed to reshuffle queue for account ${id} after resuming`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return data as AccountResponse;
  }
}
