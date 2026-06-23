export interface PublishableItem {
  id: number;
  account_id: number;
  video_url: string;
  caption: string | null;
  scheduled_for: string;
  status: string;
  retry_count: number;
  // Joined from accounts table
  username: string;
  platforms_enabled: {
    instagram?: boolean;
    facebook?: boolean;
    tiktok?: boolean;
    x?: boolean;
    youtube?: boolean;
  };
  published_platforms: string[]; // List of platform names this item has successfully posted to
  instagram_business_id?: string;
  facebook_page_id?: string;
  access_token?: string; // meta
  tiktok_access_token?: string;
  twitter_access_token?: string;
  twitter_access_secret?: string;
  youtube_refresh_token?: string;
}

export interface PlatformPublisher {
  /**
   * The unique name of the platform (e.g., 'instagram', 'tiktok')
   */
  readonly platformName: string;

  /**
   * Publishes the video to the platform.
   * Should throw an Error if publishing fails.
   */
  publish(item: PublishableItem): Promise<void>;
}
