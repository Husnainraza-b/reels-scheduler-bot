import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { CryptoModule } from '../crypto/crypto.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DatabaseModule, CryptoModule, AuthModule, StorageModule],
  controllers: [AccountsController],
})
export class AccountsModule {}
