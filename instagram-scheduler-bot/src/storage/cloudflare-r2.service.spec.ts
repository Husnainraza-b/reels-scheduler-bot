import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { CloudflareR2Service } from './cloudflare-r2.service';

describe('CloudflareR2Service', () => {
  const mockEnv: Record<string, string> = {
    R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
    R2_PUBLIC_DEV_URL: 'https://pub-test.r2.dev',
  };

  let service: CloudflareR2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudflareR2Service,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): string | undefined => mockEnv[key],
          },
        },
      ],
    }).compile();

    service = module.get<CloudflareR2Service>(CloudflareR2Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor validation', () => {
    const requiredKeys = [
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_NAME',
      'R2_PUBLIC_DEV_URL',
    ];

    it.each(requiredKeys)(
      'should throw if %s is missing',
      async (missingKey: string) => {
        await expect(
          Test.createTestingModule({
            providers: [
              CloudflareR2Service,
              {
                provide: ConfigService,
                useValue: {
                  get: (key: string): string | undefined =>
                    key === missingKey ? undefined : mockEnv[key],
                },
              },
            ],
          }).compile(),
        ).rejects.toThrow(InternalServerErrorException);
      },
    );
  });
});
