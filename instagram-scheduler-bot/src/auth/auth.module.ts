import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { TokenExpiryService } from './token-expiry.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard, TokenExpiryService],
  exports: [AdminAuthGuard],
})
export class AuthModule {}
