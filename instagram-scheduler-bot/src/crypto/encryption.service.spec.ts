import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const VALID_KEY = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // exactly 32 chars

  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): string | undefined => {
              if (key === 'ENCRYPTION_KEY') return VALID_KEY;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should return an object with encryptedText and iv as hex strings', () => {
      const result = service.encrypt('my-secret-token');

      expect(result).toHaveProperty('encryptedText');
      expect(result).toHaveProperty('iv');
      expect(typeof result.encryptedText).toBe('string');
      expect(typeof result.iv).toBe('string');
      // Hex strings should only contain hex characters
      expect(result.encryptedText).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      // IV should be 16 bytes = 32 hex chars
      expect(result.iv).toHaveLength(32);
    });

    it('should produce different ciphertexts for the same input (unique IVs)', () => {
      const result1 = service.encrypt('same-token');
      const result2 = service.encrypt('same-token');

      expect(result1.encryptedText).not.toBe(result2.encryptedText);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe('decrypt', () => {
    it('should correctly round-trip encrypt and decrypt', () => {
      const plaintext = 'EAAGm0PX4ZCpsBO9xyz...long-token-here';
      const { encryptedText, iv } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedText, iv);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const { encryptedText, iv } = service.encrypt('');
      const decrypted = service.decrypt(encryptedText, iv);

      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', () => {
      const plaintext = '🔑 token with émojis and spëcial chars!';
      const { encryptedText, iv } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedText, iv);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('constructor validation', () => {
    it('should throw if ENCRYPTION_KEY is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: { get: (): undefined => undefined },
            },
          ],
        }).compile(),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw if ENCRYPTION_KEY is not 32 characters', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: { get: (): string => 'too-short' },
            },
          ],
        }).compile(),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
