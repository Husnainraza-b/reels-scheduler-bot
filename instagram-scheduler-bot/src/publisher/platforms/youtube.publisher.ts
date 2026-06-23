import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PlatformPublisher, PublishableItem } from './platform-publisher.interface';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';

@Injectable()
export class YoutubePublisher implements PlatformPublisher {
  readonly platformName = 'youtube';
  private readonly logger = new Logger(YoutubePublisher.name);

  constructor(private readonly configService: ConfigService) {}

  async publish(item: PublishableItem): Promise<void> {
    if (!item.youtube_refresh_token) {
      throw new Error('Missing YouTube Refresh Token.');
    }

    const clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('YOUTUBE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('YouTube Client ID and Secret are not configured in environment.');
    }

    this.logger.log(`[YT] Publishing to YouTube Shorts...`);

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: item.youtube_refresh_token });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Stream video directly from R2 URL
    const response = await axios.get(item.video_url, { responseType: 'stream' });
    const videoStream: Readable = response.data;

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: item.caption ? item.caption.substring(0, 100) : 'Short',
          description: item.caption || '',
          tags: ['shorts'], // important for shorts
        },
        status: {
          privacyStatus: 'public', // public, private, or unlisted
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: videoStream,
      },
    });

    if (!res.data?.id) {
      throw new Error('YouTube API did not return a published video ID.');
    }

    this.logger.log(`[YT] Published to YouTube! Video ID: ${res.data.id}`);
  }
}
