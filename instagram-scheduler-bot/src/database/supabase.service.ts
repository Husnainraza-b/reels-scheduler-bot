import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Provides a singleton Supabase client configured with the Service Role Key.
 *
 * Using the Service Role Key bypasses Row Level Security (RLS), which is
 * required for autonomous backend operations like queue management
 * and token storage.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl) {
      throw new InternalServerErrorException(
        'CRITICAL: SUPABASE_URL is missing from environment variables.',
      );
    }

    if (!serviceRoleKey) {
      throw new InternalServerErrorException(
        'CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.',
      );
    }

    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        // Disable auto-refresh and session persistence — this is a server-side
        // service client, not a browser client.
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase client initialized successfully.');
  }

  /**
   * Validates the connection to Supabase on application startup.
   * Runs automatically via NestJS lifecycle hook.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Lightweight query to verify connectivity — uses actual table name
      const { error } = await this.client
        .from('accounts')
        .select('id', { count: 'exact', head: true });

      if (error) {
        this.logger.warn(
          `Supabase connectivity check returned an error: ${error.message}. ` +
            'This may be expected if the table does not exist yet.',
        );
      } else {
        this.logger.log('Supabase connection verified successfully.');
      }
    } catch (err) {
      this.logger.error(
        'Failed to connect to Supabase during initialization.',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Returns the Supabase client for use in other services.
   * The client uses the Service Role Key, bypassing RLS.
   */
  getClient(): SupabaseClient {
    return this.client;
  }
}
