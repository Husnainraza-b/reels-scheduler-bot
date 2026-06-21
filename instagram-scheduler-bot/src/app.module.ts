import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { CryptoModule } from './crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { SlackModule } from './slack/slack.module';
import { QueueModule } from './queue/queue.module';
import { PublisherModule } from './publisher/publisher.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { SlotsModule } from './slots/slots.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    // Loads .env and makes ConfigService available globally
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    // Global rate limiting configuration
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    CryptoModule,
    DatabaseModule,
    StorageModule,
    SlackModule,
    QueueModule,
    PublisherModule,
    AuthModule,
    AccountsModule,
    SlotsModule,
    SchedulerModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
