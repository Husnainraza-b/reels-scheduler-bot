import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-CBC encryption service for securing sensitive tokens
 * (Instagram API tokens, etc.) before persisting to Supabase.
 *
 * Each encrypt() call generates a unique random IV, ensuring
 * identical plaintext values produce different ciphertext.
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc' as const;
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyString = this.configService.get<string>('ENCRYPTION_KEY');

    if (!keyString || keyString.length !== 32) {
      throw new InternalServerErrorException(
        'CRITICAL: ENCRYPTION_KEY in .env must be exactly 32 characters long. ' +
          `Received ${keyString ? keyString.length : 0} characters.`,
      );
    }

    this.key = Buffer.from(keyString, 'utf8');
  }

  /**
   * Encrypts a plaintext string using AES-256-CBC.
   *
   * @param text - The plaintext to encrypt (e.g., an Instagram API token).
   * @returns An object containing the hex-encoded ciphertext and the hex-encoded IV.
   *          Both values must be stored together to allow decryption.
   */
  encrypt(text: string): { encryptedText: string; iv: string } {
    const iv: Buffer = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted: string = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encryptedText: encrypted,
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypts a hex-encoded ciphertext back to the original plaintext.
   *
   * @param encryptedText - The hex-encoded ciphertext from the database.
   * @param ivHex - The hex-encoded IV that was stored alongside the ciphertext.
   * @returns The original plaintext string.
   */
  decrypt(encryptedText: string, ivHex: string): string {
    const iv: Buffer = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

    let decrypted: string = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
