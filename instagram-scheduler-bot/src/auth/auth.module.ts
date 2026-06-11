import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard],
  exports: [AdminAuthGuard],
})
export class AuthModule {}
