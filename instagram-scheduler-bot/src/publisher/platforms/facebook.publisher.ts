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

  async publish(item: PublishableItem): Promise<void | { status: 'verifying'; media_id: string }> {
    if (!item.facebook_page_id || !item.access_token) {
      throw new Error('Missing Facebook Page ID or Access Token.');
    }

    const headResponse = await axios.head(item.video_url);
    const contentLength = parseInt(String(headResponse.headers['content-length'] || '0'), 10);
    const sizeInMB = contentLength / (1024 * 1024);

    this.logger.log(`[FB] File size is ${sizeInMB.toFixed(2)} MB`);

    let videoId: string;

    if (sizeInMB < 50) {
      videoId = await this.uploadStandard(
        item.facebook_page_id,
        item.video_url,
        item.caption || '',
        item.access_token,
      );
    } else {
      videoId = await this.uploadResumable(
        item.facebook_page_id,
        item.video_url,
        item.caption || '',
        item.access_token,
        contentLength,
      );
    }

    this.logger.log(`[FB] Upload finished: ${videoId}. Handoff to verification poller.`);

    return { status: 'verifying', media_id: videoId };
  }

  private async uploadStandard(
    pageId: string,
    videoUrl: string,
    caption: string,
    accessToken: string,
  ): Promise<string> {
    const uploadUrl = `https://graph.facebook.com/${this.graphApiVersion}/${pageId}/videos`;
    const response = await axios.post<{ id: string }>(uploadUrl, null, {
      params: {
        file_url: videoUrl,
        description: caption,
        access_token: accessToken,
      },
    });

    if (!response.data?.id) {
      throw new Error('Facebook API did not return a published media ID.');
    }

    return response.data.id;
  }

  private async uploadResumable(
    pageId: string,
    videoUrl: string,
    caption: string,
    accessToken: string,
    contentLength: number,
  ): Promise<string> {
    const startUrl = `https://graph.facebook.com/${this.graphApiVersion}/${pageId}/video_reels`;
    
    // 1. START
    const startRes = await axios.post<{ video_id: string; upload_url: string }>(startUrl, null, {
      params: {
        upload_phase: 'start',
        access_token: accessToken,
        file_size: contentLength,
      },
    });

    const videoId = startRes.data.video_id;

    // 2. TRANSFER
    const videoStream = await axios.get(videoUrl, { responseType: 'stream' });
    
    const FormData = require('form-data');
    const form = new FormData();
    form.append('video_file_chunk', videoStream.data);
    form.append('upload_phase', 'transfer');
    form.append('access_token', accessToken);
    form.append('video_id', videoId);
    form.append('start_offset', '0');

    await axios.post(startUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // 3. FINISH
    const finishRes = await axios.post<{ success: boolean }>(startUrl, null, {
      params: {
        upload_phase: 'finish',
        access_token: accessToken,
        video_id: videoId,
        video_state: 'PUBLISHED',
        description: caption,
      },
    });

    if (!finishRes.data.success) {
      throw new Error('Meta API finish phase failed.');
    }

    return videoId;
  }
}
