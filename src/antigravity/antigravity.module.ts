import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AntigravityController } from './antigravity.controller';
import { AntigravityService } from './antigravity.service';
import { AnthropicTransformerService } from './services/anthropic-transformer.service';
import { RequestTransformerService } from './services/request-transformer.service';
import { ResponseTransformerService } from './services/response-transformer.service';
import { StreamTransformerService } from './services/stream-transformer.service';
import { TransformerService } from './services/transformer.service';
import { QuotaModule } from '../quota/quota.module';

@Module({
  imports: [ConfigModule, QuotaModule],
  controllers: [AntigravityController],
  providers: [
    AntigravityService,
    AnthropicTransformerService,
    RequestTransformerService,
    ResponseTransformerService,
    StreamTransformerService,
    TransformerService,
  ],
  exports: [AntigravityService],
})
export class AntigravityModule {}
