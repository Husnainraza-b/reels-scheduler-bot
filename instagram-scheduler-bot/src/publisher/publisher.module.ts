import { Module } from '@nestjs/common';
import { PublisherController } from './publisher.controller';
import { CronPublisherService } from './cron-publisher.service';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../crypto/crypto.module';
import { StorageModule } from '../storage/storage.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [DatabaseModule, CryptoModule, StorageModule, SchedulerModule],
  controllers: [PublisherController],
  providers: [CronPublisherService],
})
export class PublisherModule {}
