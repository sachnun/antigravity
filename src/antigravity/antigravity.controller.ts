import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Headers,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AntigravityService } from './antigravity.service';
import { ChatCompletionRequestDto } from './dto';
import { AnthropicMessagesRequestDto } from './dto/anthropic-messages-request.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class AntigravityController {
  constructor(private readonly antigravityService: AntigravityService) {}

  @Post('chat/completions')
  @HttpCode(200)
  async chatCompletions(
    @Body() dto: ChatCompletionRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const requestId = `req_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    const startTime = Date.now();

    res.setHeader('x-request-id', requestId);

    if (dto.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await this.antigravityService.chatCompletionStream(dto, res);
      return;
    }

    const result = await this.antigravityService.chatCompletion(dto);
    res.setHeader('openai-processing-ms', String(Date.now() - startTime));
    return result;
  }

  @Get('models')
  listModels(@Res({ passthrough: true }) res: Response) {
    const requestId = `req_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    res.setHeader('x-request-id', requestId);
    return this.antigravityService.listModels();
  }

  @Post('messages')
  @HttpCode(200)
  async anthropicMessages(
    @Body() dto: AnthropicMessagesRequestDto,
    @Headers('anthropic-version') _anthropicVersion: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const messageId = `msg_${uuidv4().replace(/-/g, '').slice(0, 24)}`;

    res.setHeader('x-request-id', messageId);

    if (dto.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await this.antigravityService.anthropicMessagesStream(
        dto,
        res,
        messageId,
      );
      return;
    }

    return this.antigravityService.anthropicMessages(dto, messageId);
  }
}
