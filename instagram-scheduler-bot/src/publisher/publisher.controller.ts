import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronPublisherService } from './cron-publisher.service';
import * as crypto from 'crypto';

@Controller('cron')
export class PublisherController {
  private readonly cronSecretBuffer: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly publisherService: CronPublisherService,
  ) {
    const secret = this.configService.get<string>('CRON_SECRET');
    if (!secret) {
      throw new Error('CRON_SECRET missing from environment');
    }
    this.cronSecretBuffer = Buffer.from(secret, 'utf8');
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publishQueue(@Headers('X-Cron-Secret') secretHeader: string) {
    if (!secretHeader) {
      throw new ForbiddenException('Invalid cron secret');
    }

    const headerBuffer = Buffer.from(secretHeader, 'utf8');

    if (
      this.cronSecretBuffer.length !== headerBuffer.length ||
      !crypto.timingSafeEqual(this.cronSecretBuffer, headerBuffer)
    ) {
      throw new ForbiddenException('Invalid cron secret');
    }

    // Fire and forget
    this.publisherService.checkAndPublishActiveQueue().catch(console.error);
    return { status: 'Publishing triggered' };
  }
}
