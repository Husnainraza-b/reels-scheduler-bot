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

interface CreateAccountDto {
  username: string;
  instagram_business_id: string;
  access_token: string;
}

interface UpdateAccountDto {
  username?: string;
  instagram_business_id?: string;
  access_token?: string;
}

interface AccountResponse {
  id: number;
  username: string;
  instagram_business_id: string;
  created_at: string;
}

@Controller('dashboard/accounts')
@UseGuards(AdminAuthGuard)
export class AccountsController {
  private readonly logger = new Logger(AccountsController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {}

  @Get()
  async getAccounts(): Promise<AccountResponse[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .select('id, username, instagram_business_id, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to fetch accounts.', error.message);
      throw new BadRequestException({ error: `Failed to fetch accounts: ${error.message}`, code: 'FETCH_FAILED' });
    }

    return (data || []) as AccountResponse[];
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAccount(
    @Body() body: CreateAccountDto,
  ): Promise<AccountResponse> {
    const { username, instagram_business_id, access_token } = body;

    let cleanUsername = username;
    if (cleanUsername && cleanUsername.startsWith('@')) {
      cleanUsername = cleanUsername.substring(1);
    }

    if (!cleanUsername || !instagram_business_id || !access_token) {
      throw new BadRequestException({ error: 'username, instagram_business_id, and access_token are all required.', code: 'MISSING_FIELDS' });
    }

    if (!access_token.trim()) {
      throw new BadRequestException({
        error: 'access_token cannot be blank or whitespace.',
        code: 'INVALID_TOKEN',
      });
    }

    const { encryptedText, iv } = this.encryptionService.encrypt(access_token);
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        username: cleanUsername,
        instagram_business_id,
        access_token: `${iv}:${encryptedText}`,
      })
      .select('id, username, instagram_business_id, created_at')
      .single();

    if (error) {
      this.logger.error('Failed to create account.', error.message);
      throw new BadRequestException({ error: `Failed to create account: ${error.message}`, code: 'CREATE_FAILED' });
    }

    this.logger.log(`✅ Account created: "${cleanUsername}" (${instagram_business_id})`);
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
      this.logger.warn(`Failed to fetch queue items for account ${id} before deletion. R2 videos might be orphaned.`, fetchError.message);
    } else if (queueItems && queueItems.length > 0) {
      this.logger.log(`Found ${queueItems.length} queued videos for account ${id}. Deleting from R2...`);
      for (const item of queueItems) {
        if (item.video_url) {
          const fileName = item.video_url.split('/').pop();
          if (fileName) {
            try {
              await this.cloudflareR2Service.deleteVideo(fileName);
            } catch (err) {
              this.logger.warn(`Could not delete video ${fileName} from R2 during account deletion. Skipping.`, err);
            }
          }
        }
      }
    }

    // 2. Delete the account (which cascade-deletes the queue rows)
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete account ${id}.`, error.message);
      throw new BadRequestException({ error: `Failed to delete account: ${error.message}`, code: 'DELETE_FAILED' });
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
    const { username, instagram_business_id, access_token } = body;

    const updates: Record<string, any> = {};
    if (username !== undefined) {
      updates.username = username.startsWith('@') ? username.substring(1) : username;
    }
    if (instagram_business_id !== undefined) updates.instagram_business_id = instagram_business_id;

    if (access_token) {
      const { encryptedText, iv } = this.encryptionService.encrypt(access_token);
      updates.access_token = `${iv}:${encryptedText}`;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException({ error: 'No fields provided to update.', code: 'NO_UPDATES' });
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select('id, username, instagram_business_id, created_at')
      .single();

    if (error) {
      this.logger.error(`Failed to update account ${id}.`, error.message);
      throw new BadRequestException({ error: `Failed to update account: ${error.message}`, code: 'UPDATE_FAILED' });
    }

    this.logger.log(`🔄 Account updated: "${data.username}" (${data.instagram_business_id})`);
    return data as AccountResponse;
  }
}
