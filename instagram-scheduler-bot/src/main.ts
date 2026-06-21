import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable raw body parsing so the Slack signature guard
    // can access the unmodified request body for HMAC verification.
    rawBody: true,
  });

  app.use(helmet());

  app.setGlobalPrefix('api');

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL');

  // Enable CORS so the React frontend (running on a different port) can
  // communicate with the backend API.
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://reels-scheduler-bot.vercel.app',
      ...(frontendUrl ? [frontendUrl] : []),
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Instagram Scheduler Bot running on port ${port}`);
}
bootstrap();
