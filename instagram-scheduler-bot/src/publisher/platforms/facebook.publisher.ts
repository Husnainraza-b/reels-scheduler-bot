import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PlatformPublisher, PublishableItem } from './platform-publisher.interface';

@Injectable()
export class FacebookPublisher implements PlatformPublisher {
  readonly platformName = 'facebook';
  private readonly logger = new Logger(FacebookPublisher.name);
  private readonly graphApiVersion: string;

  constructor(private readonly configService: ConfigService) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION') || 'v20.0';
  }

  async publish(item: PublishableItem): Promise<void> {
    if (!item.facebook_page_id || !item.access_token) {
      throw new Error('Missing Facebook Page ID or Access Token.');
    }

    // For Facebook Pages, we post directly to /{page_id}/video_reels
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${item.facebook_page_id}/video_reels`;
    
    // Facebook API requires a slightly different process for Reels.
    // We initiate a session, upload the video, and finish.
    // For simplicity in this implementation, we will use the hosted video URL method if supported,
    // or standard page video upload.
    
    this.logger.log(`[FB] Publishing to Facebook Page: ${item.facebook_page_id}...`);
    
    // Attempt standard video upload via file URL
    const uploadUrl = `https://graph.facebook.com/${this.graphApiVersion}/${item.facebook_page_id}/videos`;
    const response = await axios.post<{ id: string }>(uploadUrl, null, {
      params: {
        file_url: item.video_url,
        description: item.caption || '',
        access_token: item.access_token,
      },
    });

    if (!response.data?.id) {
      throw new Error('Facebook API did not return a published media ID.');
    }

    this.logger.log(`[FB] Published to Facebook! Video ID: ${response.data.id}`);
  }
}
