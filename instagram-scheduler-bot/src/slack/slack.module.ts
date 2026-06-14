import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DatabaseModule } from '../database/database.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';

@Module({
  imports: [StorageModule, DatabaseModule, SchedulerModule, AnalyticsModule],
  controllers: [SlackController],
  providers: [SlackService],
})
export class SlackModule {}
