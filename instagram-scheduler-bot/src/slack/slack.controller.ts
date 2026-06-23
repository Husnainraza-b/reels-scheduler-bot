import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { SlackSignatureGuard } from './guards/slack-signature.guard';
import { SlackService } from './slack.service';

/**
 * Slack event payload types for type safety.
 */
interface SlackUrlVerification {
  type: 'url_verification';
  challenge: string;
  token: string;
}

interface SlackFile {
  id: string;
  url_private_download: string;
  mimetype: string;
  name: string;
}

interface SlackMessageEvent {
  type: 'message';
  text?: string;
  files?: SlackFile[];
  channel: string;
  user: string;
  ts: string;
}

interface SlackEventCallback {
  type: 'event_callback';
  event: SlackMessageEvent;
  event_id: string;
  team_id: string;
}

type SlackEventPayload = SlackUrlVerification | SlackEventCallback;

@Controller('slack')
@UseGuards(SlackSignatureGuard)
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(private readonly slackService: SlackService) {}

  /**
   * POST /slack/events
   *
   * Handles two types of Slack payloads:
   * 1. URL Verification — returns the challenge string (Slack app setup).
   * 2. Event Callback — processes file uploads asynchronously.
   */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  handleEvent(@Body() body: SlackEventPayload): { challenge: string } | void {
    // --- Rule 1: URL Verification (Slack app setup handshake) ---
    if (body.type === 'url_verification') {
      this.logger.log('Received Slack URL verification challenge.');
      return { challenge: (body as SlackUrlVerification).challenge };
    }

    // --- Rule 2: Event Callback ---
    if (body.type === 'event_callback') {
      const { event } = body as any;
      this.logger.debug(
        `--> [CONTROLLER] Event callback triggered. Type: ${event.type}`,
      );

      this.logger.debug(
        `--> [CONTROLLER] Files attached: ${event.files ? event.files.length : 0}`,
      );

      if (event.type === 'message' && !(event as any).bot_id) {
        const hasText = !!(event.text && event.text.trim().length > 0);
        const hasFiles = !!(event.files && event.files.length > 0);

        if (hasText || hasFiles) {
          this.logger.log(
            `Received message event from user "${event.user}" in channel "${event.channel}". Files: ${hasFiles ? event.files!.length : 0}`,
          );

          // Fire-and-forget: process asynchronously so we return 200 instantly.
          // Slack retries if it doesn't get a 200 within 3 seconds.
          this.slackService.processIncomingFile(event).catch((error) => {
            this.logger.error(
              `Failed to process event "${(body as SlackEventCallback).event_id}".`,
              error instanceof Error ? error.stack : String(error),
            );
          });
        }
      }
    }

    // Return nothing — NestJS will send HTTP 200 with empty body.
    return;
  }
}
