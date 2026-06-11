import { Module } from '@nestjs/common';
import { SlotsController } from './slots.controller';
import { DatabaseModule } from '../database/database.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, SchedulerModule, AuthModule],
  controllers: [SlotsController],
})
export class SlotsModule {}
