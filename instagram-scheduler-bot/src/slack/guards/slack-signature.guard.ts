import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

/**
 * NestJS guard that verifies incoming Slack webhook requests
 * by validating the HMAC SHA256 signature.
 *
 * This prevents spoofed requests from reaching our Slack event handlers.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
@Injectable()
export class SlackSignatureGuard implements CanActivate {
  private readonly logger = new Logger(SlackSignatureGuard.name);
  private readonly signingSecret: string;

  /** Maximum age of a valid request timestamp (5 minutes in seconds). */
  private static readonly MAX_TIMESTAMP_AGE_SECONDS = 300;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('SLACK_SIGNING_SECRET');

    if (!secret) {
      throw new ForbiddenException(
        'CRITICAL: SLACK_SIGNING_SECRET is missing from environment variables.',
      );
    }

    this.signingSecret = secret;
  }

  canActivate(context: ExecutionContext): boolean {
    this.logger.log('--> [WEBHOOK HIT] Request received at /slack/events');

    const request = context.switchToHttp().getRequest<
      Request & { rawBody?: Buffer }
    >();

    const timestamp = request.headers['x-slack-request-timestamp'] as
      | string
      | undefined;
    const slackSignature = request.headers['x-slack-signature'] as
      | string
      | undefined;

    // --- Validate headers exist ---
    if (!timestamp || !slackSignature) {
      this.logger.warn(
        'Rejected request: Missing x-slack-request-timestamp or x-slack-signature header.',
      );
      throw new ForbiddenException(
        'Missing Slack signature headers.',
      );
    }

    // --- Replay attack prevention: reject timestamps older than 5 minutes ---
    const requestTimestamp = parseInt(timestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeDifference = Math.abs(currentTimestamp - requestTimestamp);

    if (timeDifference > SlackSignatureGuard.MAX_TIMESTAMP_AGE_SECONDS) {
      this.logger.warn(
        `Rejected request: Timestamp too old (${timeDifference}s drift). Possible replay attack.`,
      );
      throw new ForbiddenException(
        'Request timestamp is too old. Possible replay attack.',
      );
    }

    // --- Compute and compare HMAC signature ---
    const rawBody = request.rawBody;
    if (!rawBody) {
      this.logger.error(
        'rawBody is not available on the request. ' +
          'Ensure NestFactory.create() is called with { rawBody: true }.',
      );
      throw new ForbiddenException('Unable to verify request signature.');
    }

    const sigBaseString = `v0:${timestamp}:${rawBody.toString('utf8')}`;

    const computedSignature =
      'v0=' +
      crypto
        .createHmac('sha256', this.signingSecret)
        .update(sigBaseString, 'utf8')
        .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const computedBuffer = Buffer.from(computedSignature, 'utf8');
    const receivedBuffer = Buffer.from(slackSignature, 'utf8');

    if (
      computedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(computedBuffer, receivedBuffer)
    ) {
      this.logger.error('[GUARD EXCEPTION] Slack signature validation failed. Check SLACK_SIGNING_SECRET.');
      this.logger.warn('Rejected request: Slack signature mismatch.');
      throw new ForbiddenException('Invalid Slack signature.');
    }

    this.logger.debug('Slack signature verified successfully.');
    return true;
  }
}
