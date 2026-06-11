import {
  Controller,
  Get,
  Post,
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

interface CreateAccountDto {
  username: string;
  instagram_business_id: string;
  access_token: string;
}

interface AccountResponse {
  id: number;
  username: string;
  instagram_business_id: string;
  created_at: string;
}

@Controller('api/dashboard/accounts')
@UseGuards(AdminAuthGuard)
export class AccountsController {
  private readonly logger = new Logger(AccountsController.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
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

    if (!username || !instagram_business_id || !access_token) {
      throw new BadRequestException({ error: 'username, instagram_business_id, and access_token are all required.', code: 'MISSING_FIELDS' });
    }

    const { encryptedText, iv } = this.encryptionService.encrypt(access_token);
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        username,
        instagram_business_id,
        encrypted_access_token: encryptedText,
        token_iv: iv,
      })
      .select('id, username, instagram_business_id, created_at')
      .single();

    if (error) {
      this.logger.error('Failed to create account.', error.message);
      throw new BadRequestException({ error: `Failed to create account: ${error.message}`, code: 'CREATE_FAILED' });
    }

    this.logger.log(`✅ Account created: "${username}" (${instagram_business_id})`);
    return data as AccountResponse;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Param('id') id: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete account ${id}.`, error.message);
      throw new BadRequestException({ error: `Failed to delete account: ${error.message}`, code: 'DELETE_FAILED' });
    }

    this.logger.log(`🗑️  Account "${id}" deleted.`);
    return { deleted: true };
  }
}
