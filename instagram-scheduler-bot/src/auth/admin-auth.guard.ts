import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Lightweight Admin authentication guard.
 *
 * Checks for an `Authorization: Bearer <password>` header and compares
 * it against the ADMIN_PASSWORD environment variable using timing-safe comparison.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminAuthGuard.name);
  private readonly adminPasswordBuffer: Buffer;

  constructor(private readonly configService: ConfigService) {
    const password = this.configService.get<string>('ADMIN_PASSWORD') || '';

    if (!password) {
      this.logger.warn(
        'ADMIN_PASSWORD is not set. All dashboard requests will be rejected.',
      );
    }

    this.adminPasswordBuffer = Buffer.from(password, 'utf8');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const tokenBuffer = Buffer.from(token, 'utf8');

    if (
      this.adminPasswordBuffer.length !== tokenBuffer.length ||
      !crypto.timingSafeEqual(this.adminPasswordBuffer, tokenBuffer)
    ) {
      this.logger.warn('Dashboard access denied: invalid admin password.');
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    return true;
  }
}
