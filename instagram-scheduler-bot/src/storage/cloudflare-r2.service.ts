import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

/**
 * Cloudflare R2 storage service for uploading and deleting video files.
 *
 * Uses AWS SDK v3 with R2-compatible S3 endpoint. The Upload class
 * handles multipart streaming so large video files don't exhaust
 * server memory.
 */
@Injectable()
export class CloudflareR2Service {
  private readonly logger = new Logger(CloudflareR2Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicDevUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    const publicDevUrl = this.configService.get<string>('R2_PUBLIC_DEV_URL');

    // Validate all required R2 configuration
    const missing: string[] = [];
    if (!endpoint) missing.push('R2_ENDPOINT');
    if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
    if (!bucketName) missing.push('R2_BUCKET_NAME');
    if (!publicDevUrl) missing.push('R2_PUBLIC_DEV_URL');

    if (missing.length > 0) {
      throw new InternalServerErrorException(
        `CRITICAL: Missing R2 environment variables: ${missing.join(', ')}`,
      );
    }

    // TypeScript narrowing — all values are guaranteed non-null after the check
    this.bucketName = bucketName!;
    this.publicDevUrl = publicDevUrl!;

    this.s3Client = new S3Client({
      endpoint: endpoint!,
      region: 'auto',
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });

    this.logger.log(
      `Cloudflare R2 client initialized. Bucket: "${this.bucketName}"`,
    );
  }

  /**
   * Uploads a video file to Cloudflare R2 using multipart streaming.
   *
   * @param fileStream - A readable stream or Buffer containing the video data.
   * @param fileName - The object key / filename to store in R2.
   * @returns The public URL of the uploaded file.
   */
  async uploadVideo(
    fileStream: NodeJS.ReadableStream | Buffer,
    fileName: string,
  ): Promise<string> {
    const body =
      fileStream instanceof Buffer
        ? Readable.from(fileStream)
        : (fileStream as Readable);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: fileName,
        Body: body,
        ContentType: 'video/mp4',
      },
      // 5 MB per part, up to 4 concurrent uploads
      partSize: 5 * 1024 * 1024,
      queueSize: 4,
    });

    upload.on('httpUploadProgress', (progress) => {
      this.logger.debug(
        `Upload progress for "${fileName}": ${progress.loaded ?? 0} bytes uploaded`,
      );
    });

    try {
      await upload.done();

      const publicUrl = `${this.publicDevUrl}/${fileName}`;
      this.logger.log(`Video uploaded successfully: ${publicUrl}`);

      return publicUrl;
    } catch (error) {
      this.logger.error(
        `Failed to upload video "${fileName}" to R2.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Permanently deletes a video file from the R2 bucket.
   *
   * @param fileName - The object key / filename to delete.
   */
  async deleteVideo(fileName: string): Promise<void> {
    const params: DeleteObjectCommandInput = {
      Bucket: this.bucketName,
      Key: fileName,
    };

    try {
      await this.s3Client.send(new DeleteObjectCommand(params));
      this.logger.log(`Video deleted successfully from R2: "${fileName}"`);
    } catch (error) {
      this.logger.error(
        `Failed to delete video "${fileName}" from R2.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
