import { Injectable, Logger } from '@nestjs/common';
import { PlatformPublisher, PublishableItem } from './platform-publisher.interface';
import axios from 'axios';

@Injectable()
export class SnapchatPublisher implements PlatformPublisher {
  readonly platformName = 'snapchat';
  private readonly logger = new Logger(SnapchatPublisher.name);

  async publish(item: PublishableItem): Promise<void> {
    if (!item.snapchat_access_token) {
      throw new Error('Missing Snapchat Access Token.');
    }

    this.logger.log(`[Snapchat] Publishing to Spotlight...`);

    try {
      // Official/Third-party standard API structure for Snapchat posting.
      // This is pointing to the Snapchat Business API for media uploads.
      const postUrl = 'https://adsapi.snapchat.com/v1/media';
      
      const postResponse = await axios.post(
        postUrl,
        {
          name: item.caption ? item.caption.substring(0, 50) : 'Spotlight Video',
          type: 'VIDEO',
          media_url: item.video_url,
          // Additional parameters like ad_account_id might be needed depending on the exact token scope
        },
        {
          headers: {
            Authorization: `Bearer ${item.snapchat_access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Expect a media ID back from a successful creation
      const mediaId = postResponse.data?.media?.id || postResponse.data?.id;
      if (!mediaId && postResponse.status !== 200 && postResponse.status !== 201) {
        throw new Error('Snapchat API did not return a successful response or media ID.');
      }

      this.logger.log(`[Snapchat] Successfully published to Spotlight! Media ID: ${mediaId || 'Unknown'}`);
    } catch (error: any) {
      this.logger.error(`[Snapchat] Publish failed`, error?.response?.data || error.message);
      throw new Error(`Snapchat API Error: ${error?.response?.data?.message || error?.response?.data?.error_message || error.message}`);
    }
  }
}
