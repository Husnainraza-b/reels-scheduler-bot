import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { CryptoModule } from '../crypto/crypto.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    DatabaseModule,
    CryptoModule,
    AuthModule,
    StorageModule,
    SchedulerModule,
  ],
  controllers: [AccountsController],
})
export class AccountsModule {}
