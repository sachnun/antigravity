import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AntigravityController } from './antigravity.controller';
import { AntigravityService } from './antigravity.service';
import { AnthropicTransformerService } from './services/anthropic-transformer.service';
import { AuthService } from './services/auth.service';
import { TransformerService } from './services/transformer.service';

@Module({
  imports: [ConfigModule],
  controllers: [AntigravityController],
  providers: [
    AntigravityService,
    AnthropicTransformerService,
    AuthService,
    TransformerService,
  ],
  exports: [AntigravityService, AuthService],
})
export class AntigravityModule {}
