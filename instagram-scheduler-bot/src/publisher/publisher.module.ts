import { Module } from '@nestjs/common';
import { PublisherController } from './publisher.controller';
import { CronPublisherService } from './cron-publisher.service';
import { VerificationPollerService } from './verification-poller.service';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../crypto/crypto.module';
import { StorageModule } from '../storage/storage.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

import { InstagramPublisher } from './platforms/instagram.publisher';
import { FacebookPublisher } from './platforms/facebook.publisher';
import { TiktokPublisher } from './platforms/tiktok.publisher';
import { TwitterPublisher } from './platforms/x.publisher';
import { YoutubePublisher } from './platforms/youtube.publisher';

@Module({
  imports: [DatabaseModule, CryptoModule, StorageModule, SchedulerModule],
  controllers: [PublisherController],
  providers: [
    CronPublisherService,
    InstagramPublisher,
    FacebookPublisher,
    TiktokPublisher,
    TwitterPublisher,
    YoutubePublisher,
    VerificationPollerService
  ],
})
export class PublisherModule {}
