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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AntigravityService } from './antigravity.service';
import { ChatCompletionRequestDto } from './dto';
import { AnthropicMessagesRequestDto } from './dto/anthropic-messages-request.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('v1')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class AntigravityController {
  constructor(private readonly antigravityService: AntigravityService) {}

  @Post('chat/completions')
  @HttpCode(200)
  @ApiTags('OpenAI Compatible')
  @ApiOperation({
    summary: 'Create chat completion',
    description:
      'Creates a model response for the given chat conversation. Compatible with OpenAI API format.',
  })
  @ApiResponse({ status: 200, description: 'Chat completion response' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  @ApiHeader({
    name: 'x-antigravity-account',
    required: false,
    description: 'Force specific account email',
  })
  async chatCompletions(
    @Body() dto: ChatCompletionRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const requestId = `req_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    const startTime = Date.now();

    res.setHeader('x-request-id', requestId);

    const forcedAccountId = res.req.headers['x-antigravity-account'] as string;

    if (dto.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await this.antigravityService.chatCompletionStream(
        dto,
        res,
        forcedAccountId,
      );
      return;
    }

    const result = await this.antigravityService.chatCompletion(
      dto,
      forcedAccountId,
    );
    res.setHeader('openai-processing-ms', String(Date.now() - startTime));
    return result;
  }

  @Get('models')
  @ApiTags('Models')
  @ApiOperation({
    summary: 'List available models',
    description: 'Lists the currently available models',
  })
  @ApiResponse({ status: 200, description: 'List of available models' })
  listModels(@Res({ passthrough: true }) res: Response) {
    const requestId = `req_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    res.setHeader('x-request-id', requestId);
    return this.antigravityService.listModels();
  }

  @Post('messages')
  @HttpCode(200)
  @ApiTags('Anthropic Compatible')
  @ApiOperation({
    summary: 'Create a message',
    description: 'Send messages to Claude models using Anthropic API format',
  })
  @ApiResponse({ status: 200, description: 'Message response' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiHeader({
    name: 'anthropic-version',
    required: false,
    description: 'Anthropic API version',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'API key (alternative to Bearer token)',
  })
  @ApiHeader({
    name: 'x-antigravity-account',
    required: false,
    description: 'Force specific account email',
  })
  async anthropicMessages(
    @Body() dto: AnthropicMessagesRequestDto,
    @Headers('anthropic-version') _anthropicVersion: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const messageId = `msg_${uuidv4().replace(/-/g, '').slice(0, 24)}`;

    res.setHeader('x-request-id', messageId);

    const forcedAccountId = res.req.headers['x-antigravity-account'] as string;

    if (dto.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await this.antigravityService.anthropicMessagesStream(
        dto,
        res,
        messageId,
        forcedAccountId,
      );
      return;
    }

    return this.antigravityService.anthropicMessages(
      dto,
      messageId,
      forcedAccountId,
    );
  }

  @Get('quota')
  @ApiTags('Models')
  @ApiOperation({
    summary: 'Get quota status',
    description: 'Returns current quota status for all accounts',
  })
  @ApiResponse({ status: 200, description: 'Quota status' })
  async getQuotaStatus() {
    return this.antigravityService.getQuotaStatus();
  }
}
