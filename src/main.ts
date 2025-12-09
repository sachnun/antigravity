import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AccountsService } from './accounts/accounts.service';
import { OpenAIExceptionFilter } from './common/filters/openai-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new OpenAIExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.enableCors();

  const configService = app.get(ConfigService);
  const accountsService = app.get(AccountsService);
  const port = configService.get<number>('port') || 3000;

  if (!accountsService.hasAccounts()) {
    logger.warn('='.repeat(60));
    logger.warn('NO ACCOUNTS CONFIGURED');
    logger.warn('='.repeat(60));
    logger.warn('');
    logger.warn('To use the Antigravity API, you need to add accounts.');
    logger.warn('');
    logger.warn('Step 1: Start OAuth flow:');
    logger.warn(`  Visit: http://localhost:${port}/oauth/authorize`);
    logger.warn('');
    logger.warn('Step 2: Copy the output to your .env file:');
    logger.warn(
      '  ANTIGRAVITY_ACCOUNTS_1=\'{"email":"...","accessToken":"...","refreshToken":"...","expiryDate":...}\'',
    );
    logger.warn('');
    logger.warn('Step 3: Restart the server');
    logger.warn('');
    logger.warn('For multiple accounts (rotation), add more:');
    logger.warn("  ANTIGRAVITY_ACCOUNTS_2='...'");
    logger.warn("  ANTIGRAVITY_ACCOUNTS_3='...'");
    logger.warn('='.repeat(60));
  } else {
    const count = accountsService.getAccountCount();
    logger.log(`Loaded ${count} account(s) for rotation`);
  }

  await app.listen(port);

  logger.log('='.repeat(60));
  logger.log(`Antigravity Proxy running on http://localhost:${port}`);
  logger.log('');
  logger.log('Endpoints:');
  logger.log(`  POST /v1/chat/completions - Chat completion (OpenAI)`);
  logger.log(`  POST /v1/messages         - Messages (Anthropic)`);
  logger.log(`  GET  /v1/models           - List models`);
  logger.log(`  GET  /accounts/status     - Account status`);
  logger.log(`  GET  /oauth/authorize     - Start OAuth flow`);
  logger.log('='.repeat(60));
}
void bootstrap();
