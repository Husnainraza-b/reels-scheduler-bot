import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PlatformPublisher, PublishableItem } from './platform-publisher.interface';

@Injectable()
export class InstagramPublisher implements PlatformPublisher {
  readonly platformName = 'instagram';
  private readonly logger = new Logger(InstagramPublisher.name);
  private readonly graphApiVersion: string;

  constructor(private readonly configService: ConfigService) {
    this.graphApiVersion = this.configService.get<string>('META_GRAPH_API_VERSION') || 'v20.0';
  }

  async publish(item: PublishableItem): Promise<void> {
    if (!item.instagram_business_id || !item.access_token) {
      throw new Error('Missing Instagram Business ID or Access Token.');
    }

    const containerId = await this.createMediaContainer(
      item.instagram_business_id,
      item.video_url,
      item.caption || '',
      item.access_token,
    );

    this.logger.log(`[IG] Container created: ${containerId}. Polling...`);

    await this.waitForContainerReady(containerId, item.access_token);

    await this.publishContainer(item.instagram_business_id, containerId, item.access_token);
  }

  private async createMediaContainer(
    instagramBusinessId: string,
    videoUrl: string,
    caption: string,
    accessToken: string,
  ): Promise<string> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${instagramBusinessId}/media`;
    const response = await axios.post<{ id: string }>(url, null, {
      params: {
        video_url: videoUrl,
        caption: caption,
        media_type: 'REELS',
        access_token: accessToken,
      },
    });

    if (!response.data?.id) {
      throw new Error('Meta API did not return a container ID.');
    }
    return response.data.id;
  }

  private async waitForContainerReady(
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 600_000; // 10 mins

    while (Date.now() - startTime < timeoutMs) {
      const url = `https://graph.facebook.com/${this.graphApiVersion}/${containerId}`;
      const response = await axios.get<{ status_code: string; status?: string }>(url, {
        params: { fields: 'status_code,status', access_token: accessToken },
      });

      const status = response.data.status_code;

      if (status === 'FINISHED') return;
      if (status === 'ERROR') throw new Error(`Meta container ERROR: ${response.data.status}`);
      if (status === 'EXPIRED') throw new Error(`Meta container EXPIRED.`);

      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }

    throw new Error(`Container timed out after 10m.`);
  }

  private async publishContainer(
    instagramBusinessId: string,
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${instagramBusinessId}/media_publish`;
    const response = await axios.post<{ id: string }>(url, null, {
      params: { creation_id: containerId, access_token: accessToken },
    });

    if (!response.data?.id) {
      throw new Error('Meta API did not return a published media ID.');
    }
    this.logger.log(`[IG] Published to Instagram! Media ID: ${response.data.id}`);
  }
}
