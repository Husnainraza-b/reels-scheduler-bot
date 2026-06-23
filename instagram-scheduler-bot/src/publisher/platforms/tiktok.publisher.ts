import { Injectable, Logger } from '@nestjs/common';
import { PlatformPublisher, PublishableItem } from './platform-publisher.interface';
import axios from 'axios';

@Injectable()
export class TiktokPublisher implements PlatformPublisher {
  readonly platformName = 'tiktok';
  private readonly logger = new Logger(TiktokPublisher.name);

  async publish(item: PublishableItem): Promise<void> {
    if (!item.tiktok_access_token) {
      throw new Error('Missing TikTok Access Token.');
    }

    this.logger.log(`[TikTok] Publishing to TikTok...`);

    // TikTok Content Posting API (Direct Post)
    // First, query the creator info to get the open_id
    const userUrl = 'https://open.tiktokapis.com/v2/user/info/';
    const userResponse = await axios.get(userUrl, {
      headers: { Authorization: `Bearer ${item.tiktok_access_token}` },
      params: { fields: 'open_id' },
    });

    if (userResponse.data?.error?.code !== 'ok') {
      throw new Error(`TikTok User API Error: ${userResponse.data?.error?.message}`);
    }

    // Now initialize the post
    const postUrl = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    const postResponse = await axios.post(
      postUrl,
      {
        post_info: {
          title: item.caption || '',
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: item.video_url,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${item.tiktok_access_token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }
    );

    if (postResponse.data?.error?.code !== 'ok') {
      throw new Error(`TikTok Post API Error: ${postResponse.data?.error?.message}`);
    }

    const publishId = postResponse.data?.data?.publish_id;
    if (!publishId) {
      throw new Error('TikTok API did not return a publish_id.');
    }

    this.logger.log(`[TikTok] Published to TikTok! Publish ID: ${publishId}`);
  }
}
