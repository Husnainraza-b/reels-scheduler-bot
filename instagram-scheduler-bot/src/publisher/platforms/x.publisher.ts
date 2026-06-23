import { Injectable, Logger } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';
import { PlatformPublisher, PublishableItem } from './platform-publisher.interface';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TwitterPublisher implements PlatformPublisher {
  readonly platformName = 'x';
  private readonly logger = new Logger(TwitterPublisher.name);

  constructor(private readonly configService: ConfigService) {}

  async publish(item: PublishableItem): Promise<void> {
    if (!item.twitter_access_token || !item.twitter_access_secret) {
      throw new Error('Missing Twitter Access Token or Secret.');
    }

    const appKey = this.configService.get<string>('TWITTER_API_KEY');
    const appSecret = this.configService.get<string>('TWITTER_API_SECRET');

    if (!appKey || !appSecret) {
      throw new Error('Twitter API Key and Secret are not configured in environment.');
    }

    this.logger.log(`[X] Publishing to Twitter...`);

    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: item.twitter_access_token,
      accessSecret: item.twitter_access_secret,
    });

    // 1. Download video to memory buffer for upload
    // In a production environment, you may want to handle large files via streams
    // but for reels/shorts, memory is usually sufficient (< 50MB)
    const response = await axios.get(item.video_url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    // 2. Upload media
    const mediaId = await client.v1.uploadMedia(buffer, { mimeType: 'video/mp4' });

    // 3. Post tweet with media
    const tweet = await client.v2.tweet({
      text: item.caption || '',
      media: { media_ids: [mediaId] },
    });

    if (!tweet.data?.id) {
      throw new Error('Twitter API did not return a published tweet ID.');
    }

    this.logger.log(`[X] Published to Twitter! Tweet ID: ${tweet.data.id}`);
  }
}
