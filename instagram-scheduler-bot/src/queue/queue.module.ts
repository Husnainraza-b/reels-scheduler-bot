import { Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DatabaseModule, AuthModule, SchedulerModule, StorageModule],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}
