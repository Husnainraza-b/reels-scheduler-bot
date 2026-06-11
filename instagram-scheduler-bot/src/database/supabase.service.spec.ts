import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  const mockEnv: Record<string, string> = {
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key',
  };

  let service: SupabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): string | undefined => mockEnv[key],
          },
        },
      ],
    }).compile();

    service = module.get<SupabaseService>(SupabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose a Supabase client via getClient()', () => {
    const client = service.getClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  describe('constructor validation', () => {
    it('should throw if SUPABASE_URL is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            SupabaseService,
            {
              provide: ConfigService,
              useValue: {
                get: (key: string): string | undefined =>
                  key === 'SUPABASE_URL' ? undefined : mockEnv[key],
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            SupabaseService,
            {
              provide: ConfigService,
              useValue: {
                get: (key: string): string | undefined =>
                  key === 'SUPABASE_SERVICE_ROLE_KEY' ? undefined : mockEnv[key],
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
