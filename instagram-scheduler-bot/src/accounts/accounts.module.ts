import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { CryptoModule } from '../crypto/crypto.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, CryptoModule, AuthModule],
  controllers: [AccountsController],
})
export class AccountsModule {}
