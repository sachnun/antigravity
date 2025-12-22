import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AccountsService } from './accounts/accounts.service';
import { OpenAIExceptionFilter } from './common/filters/openai-exception.filter';
import { json, urlencoded } from 'express';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Serve static files from the public directory
  app.use('/public', express.static(join(__dirname, '..', 'public')));

  const config = new DocumentBuilder()
    .setTitle('Antigravity API')
    .setDescription(
      'OpenAI and Anthropic compatible API proxy powered by Google Antigravity',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('OpenAI Compatible', 'OpenAI-compatible chat completions API')
    .addTag('Anthropic Compatible', 'Anthropic-compatible messages API')
    .addTag('Models', 'Model listing and information')
    .addTag('OAuth', 'Authentication flow')
    .addTag('Accounts', 'Account management')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, {
    customJs: '/public/swagger-theme.js',
  });

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
    logger.warn('Start OAuth flow:');
    logger.warn(`  Visit: http://localhost:${port}/oauth/authorize`);
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
  logger.log(`  GET  /docs                - Swagger UI`);
  logger.log('='.repeat(60));
}
void bootstrap();
