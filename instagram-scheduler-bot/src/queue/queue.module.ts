import { Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [QueueController],
})
export class QueueModule {}
