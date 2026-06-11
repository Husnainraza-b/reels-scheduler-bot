import { Controller, Post, Headers, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronPublisherService } from './cron-publisher.service';

@Controller('api/cron')
export class PublisherController {
  private readonly cronSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly publisherService: CronPublisherService,
  ) {
    const secret = this.configService.get<string>('CRON_SECRET');
    if (!secret) {
      throw new Error('CRON_SECRET missing from environment');
    }
    this.cronSecret = secret;
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publishQueue(@Headers('X-Cron-Secret') secretHeader: string) {
    if (!secretHeader || secretHeader !== this.cronSecret) {
      throw new ForbiddenException('Invalid cron secret');
    }

    // Fire and forget
    this.publisherService.checkAndPublishActiveQueue().catch(console.error);
    return { status: 'Publishing triggered' };
  }
}
