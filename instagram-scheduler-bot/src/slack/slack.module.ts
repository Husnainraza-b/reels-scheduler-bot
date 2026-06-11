import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DatabaseModule } from '../database/database.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';

@Module({
  imports: [StorageModule, DatabaseModule, SchedulerModule],
  controllers: [SlackController],
  providers: [SlackService],
})
export class SlackModule {}
