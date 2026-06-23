import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../database/supabase.service';
import { WebClient } from '@slack/web-api';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenExpiryService {
  private readonly logger = new Logger(TokenExpiryService.name);
  private readonly slackClient: WebClient;
  private readonly alertChannel: string;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {
    const slackToken = this.configService.get<string>('SLACK_BOT_TOKEN');
    this.alertChannel = this.configService.get<string>('SLACK_ALERT_CHANNEL_ID') || '';
    if (slackToken) {
      this.slackClient = new WebClient(slackToken);
    } else {
      this.slackClient = new WebClient(); // mock or throw, assuming it's available since other services use it
    }
  }

  @Cron('0 9 * * 1') // Every Monday at 9 AM
  async checkTokenExpiries() {
    this.logger.log('🔐 Running weekly token expiry check...');
    const supabase = this.supabaseService.getClient();

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('username, token_expiries');

    if (error || !accounts) {
      this.logger.error('Failed to query accounts for token expiry check.');
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    const warningThreshold = nowSeconds + sevenDaysSeconds;

    for (const account of accounts) {
      const expiries = account.token_expiries || {};
      
      for (const [platform, expiryTimestamp] of Object.entries(expiries)) {
        if (typeof expiryTimestamp === 'number') {
          if (expiryTimestamp < warningThreshold) {
            const daysLeft = Math.max(0, Math.ceil((expiryTimestamp - nowSeconds) / (24 * 60 * 60)));
            const msg = `⚠️ The ${platform.toUpperCase()} Access Token for @${account.username} expires in ${daysLeft} days. Please click 'Save Changes' on the dashboard to refresh it.`;
            this.logger.warn(msg);
            
            if (this.alertChannel) {
              try {
                await this.slackClient.chat.postMessage({
                  channel: this.alertChannel,
                  text: msg,
                });
              } catch (slackErr: any) {
                this.logger.error(`Failed to send Slack alert for token expiry: ${slackErr.message}`);
              }
            }
          }
        }
      }
    }
  }
}
