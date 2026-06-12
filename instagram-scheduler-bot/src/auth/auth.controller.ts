import { Controller, Post, Body, HttpCode, HttpStatus, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body('password') password?: string) {
    if (!password) {
      throw new UnauthorizedException({ error: 'Password required', code: 'UNAUTHORIZED' });
    }

    const isValid = this.authService.validatePassword(password);
    if (!isValid) {
      throw new UnauthorizedException({ error: 'Invalid password', code: 'UNAUTHORIZED' });
    }

    return { success: true };
  }
}
