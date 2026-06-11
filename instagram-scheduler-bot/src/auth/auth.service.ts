import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminPasswordBuffer: Buffer;

  constructor(private readonly configService: ConfigService) {
    const password = this.configService.get<string>('ADMIN_PASSWORD') || '';
    this.adminPasswordBuffer = Buffer.from(password, 'utf8');
  }

  validatePassword(password: string): boolean {
    const tokenBuffer = Buffer.from(password, 'utf8');
    if (this.adminPasswordBuffer.length !== tokenBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(this.adminPasswordBuffer, tokenBuffer);
  }
}
