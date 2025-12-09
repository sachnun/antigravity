import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { AccountsService } from '../accounts/accounts.service';
import { AccountState } from '../accounts/interfaces';
import { TransformerService } from './services/transformer.service';
import { AnthropicTransformerService } from './services/anthropic-transformer.service';
import { ChatCompletionRequestDto } from './dto';
import { ChatCompletionResponse, ModelsResponse } from './dto';
import { AnthropicMessagesRequestDto } from './dto/anthropic-messages-request.dto';
import { AnthropicMessagesResponse } from './dto/anthropic-messages-response.dto';
import {
  AntigravityResponse,
  AntigravityStreamChunk,
  AntigravityError,
} from './interfaces';
import {
  BASE_URLS,
  AVAILABLE_MODELS,
  MODEL_OWNERS,
  USER_AGENT,
} from './constants';

@Injectable()
export class AntigravityService {
  private readonly logger = new Logger(AntigravityService.name);
  private currentBaseUrlIndex = 0;
  private readonly maxRetryAccounts: number;

  constructor(
    private readonly accountsService: AccountsService,
    private readonly transformerService: TransformerService,
    private readonly anthropicTransformerService: AnthropicTransformerService,
    private readonly configService: ConfigService,
  ) {
    this.maxRetryAccounts =
      this.configService.get<number>('accounts.maxRetryAccounts') || 3;
  }

  async chatCompletion(
    dto: ChatCompletionRequestDto,
  ): Promise<ChatCompletionResponse> {
    if (!this.accountsService.hasAccounts()) {
      throw new HttpException(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const requestId = `chatcmpl-${uuidv4()}`;
    const maxAttempts = Math.min(
      this.maxRetryAccounts,
      this.accountsService.getAccountCount(),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const accountState = this.accountsService.getNextAccount();

      if (!accountState) {
        const earliestCooldown = this.accountsService.getEarliestCooldownEnd();
        const retryAfter = earliestCooldown
          ? Math.ceil((earliestCooldown - Date.now()) / 1000)
          : 60;

        throw new HttpException(
          {
            error: {
              message: `All accounts are rate limited. Retry after ${retryAfter} seconds.`,
              type: 'rate_limit_error',
              param: null,
              code: 'rate_limit_exceeded',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      try {
        const projectId = await this.accountsService.getProjectId(accountState);
        const antigravityRequest = this.transformerService.transformRequest(
          dto,
          projectId,
        );

        this.logger.debug(
          `Chat completion: model=${dto.model}, account=${accountState.id} (${accountState.credential.email}), messages=${dto.messages.length}`,
        );

        const response = await this.makeRequest<AntigravityResponse>(
          ':generateContent',
          antigravityRequest,
          accountState,
        );

        this.accountsService.markSuccess(accountState.id);

        return this.transformerService.transformResponse(
          response,
          dto.model,
          requestId,
        );
      } catch (error) {
        if (this.isRateLimitError(error)) {
          this.accountsService.markCooldown(accountState.id);
          this.logger.warn(
            `Rate limited on account ${accountState.id} (${accountState.credential.email}), trying next account...`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new HttpException(
      {
        error: {
          message: 'All retry attempts exhausted due to rate limiting.',
          type: 'rate_limit_error',
          param: null,
          code: 'rate_limit_exceeded',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async chatCompletionStream(
    dto: ChatCompletionRequestDto,
    res: Response,
  ): Promise<void> {
    if (!this.accountsService.hasAccounts()) {
      throw new HttpException(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const requestId = `chatcmpl-${uuidv4()}`;
    const maxAttempts = Math.min(
      this.maxRetryAccounts,
      this.accountsService.getAccountCount(),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const accountState = this.accountsService.getNextAccount();

      if (!accountState) {
        const earliestCooldown = this.accountsService.getEarliestCooldownEnd();
        const retryAfter = earliestCooldown
          ? Math.ceil((earliestCooldown - Date.now()) / 1000)
          : 60;

        res.setHeader('Retry-After', String(retryAfter));
        throw new HttpException(
          {
            error: {
              message: `All accounts are rate limited. Retry after ${retryAfter} seconds.`,
              type: 'rate_limit_error',
              param: null,
              code: 'rate_limit_exceeded',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      try {
        const projectId = await this.accountsService.getProjectId(accountState);
        const antigravityRequest = this.transformerService.transformRequest(
          dto,
          projectId,
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        this.logger.debug(
          `Streaming chat completion: model=${dto.model}, account=${accountState.id} (${accountState.credential.email})`,
        );

        const headers = await this.accountsService.getAuthHeaders(accountState);
        const url = `${this.getBaseUrl()}:streamGenerateContent?alt=sse`;
        const host = new URL(url).host;

        const response: AxiosResponse<Readable> = await axios.post(
          url,
          antigravityRequest,
          {
            headers: {
              ...headers,
              Host: host,
              Accept: 'text/event-stream',
              'User-Agent': USER_AGENT,
            },
            responseType: 'stream',
          },
        );

        this.accountsService.markSuccess(accountState.id);

        let isFirst = true;
        let buffer = '';
        const stream = response.data;
        const accumulator = this.transformerService.createStreamAccumulator();

        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => {
            if (res.writableEnded || res.destroyed) {
              return;
            }

            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();

                if (res.writableEnded || res.destroyed) {
                  return;
                }

                if (data === '[DONE]') {
                  res.write('data: [DONE]\n\n');
                  return;
                }

                try {
                  const parsed = JSON.parse(data) as AntigravityStreamChunk;
                  const transformed =
                    this.transformerService.transformStreamChunk(
                      parsed,
                      dto.model,
                      requestId,
                      isFirst,
                      accumulator,
                    );

                  if (transformed && !res.writableEnded && !res.destroyed) {
                    res.write(`data: ${JSON.stringify(transformed)}\n\n`);
                    isFirst = false;
                  }
                } catch {
                  this.logger.warn(`Failed to parse chunk: ${data}`);
                }
              }
            }
          });

          stream.on('end', () => {
            if (!res.writableEnded && !res.destroyed) {
              if (!accumulator.isComplete) {
                const finalChunk = this.transformerService.createFinalChunk(
                  requestId,
                  dto.model,
                  accumulator,
                );
                res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
              }
              res.write('data: [DONE]\n\n');
              res.end();
            }
            resolve();
          });

          stream.on('error', (error: Error) => {
            this.logger.error(`Stream error: ${error.message}`);
            if (!res.writableEnded && !res.destroyed) {
              res.write(
                `data: ${JSON.stringify({ error: error.message })}\n\n`,
              );
              res.end();
            }
            reject(error);
          });
        });

        return;
      } catch (error) {
        if (this.isRateLimitError(error) && !res.headersSent) {
          this.accountsService.markCooldown(accountState.id);
          this.logger.warn(
            `Rate limited on account ${accountState.id} (${accountState.credential.email}), trying next account...`,
          );
          continue;
        }
        await this.handleStreamError(error, res);
        return;
      }
    }

    throw new HttpException(
      {
        error: {
          message: 'All retry attempts exhausted due to rate limiting.',
          type: 'rate_limit_error',
          param: null,
          code: 'rate_limit_exceeded',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  listModels(): ModelsResponse {
    const now = Math.floor(Date.now() / 1000);

    return {
      object: 'list',
      data: AVAILABLE_MODELS.map((id) => ({
        id,
        object: 'model' as const,
        created: now,
        owned_by: MODEL_OWNERS[id] || 'unknown',
      })),
    };
  }

  async anthropicMessages(
    dto: AnthropicMessagesRequestDto,
    messageId: string,
  ): Promise<AnthropicMessagesResponse> {
    if (!this.accountsService.hasAccounts()) {
      throw new HttpException(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const maxAttempts = Math.min(
      this.maxRetryAccounts,
      this.accountsService.getAccountCount(),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const accountState = this.accountsService.getNextAccount();

      if (!accountState) {
        throw new HttpException(
          {
            type: 'error',
            error: {
              type: 'rate_limit_error',
              message: 'All accounts are rate limited. Please try again later.',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      try {
        const projectId = await this.accountsService.getProjectId(accountState);
        const antigravityRequest =
          this.anthropicTransformerService.transformRequest(dto, projectId);

        this.logger.debug(
          `Anthropic messages: model=${dto.model}, account=${accountState.id} (${accountState.credential.email}), messages=${dto.messages.length}`,
        );

        const response = await this.makeRequest<AntigravityResponse>(
          ':generateContent',
          antigravityRequest,
          accountState,
        );

        this.accountsService.markSuccess(accountState.id);

        return this.anthropicTransformerService.transformResponse(
          response,
          dto.model,
          messageId,
        );
      } catch (error) {
        if (this.isRateLimitError(error)) {
          this.accountsService.markCooldown(accountState.id);
          this.logger.warn(
            `Rate limited on account ${accountState.id} (${accountState.credential.email}), trying next account...`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new HttpException(
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'All retry attempts exhausted due to rate limiting.',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async anthropicMessagesStream(
    dto: AnthropicMessagesRequestDto,
    res: Response,
    messageId: string,
  ): Promise<void> {
    if (!this.accountsService.hasAccounts()) {
      throw new HttpException(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const maxAttempts = Math.min(
      this.maxRetryAccounts,
      this.accountsService.getAccountCount(),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const accountState = this.accountsService.getNextAccount();

      if (!accountState) {
        throw new HttpException(
          {
            type: 'error',
            error: {
              type: 'rate_limit_error',
              message: 'All accounts are rate limited. Please try again later.',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      try {
        const projectId = await this.accountsService.getProjectId(accountState);
        const antigravityRequest =
          this.anthropicTransformerService.transformRequest(dto, projectId);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        this.logger.debug(
          `Streaming Anthropic messages: model=${dto.model}, account=${accountState.id} (${accountState.credential.email})`,
        );

        const headers = await this.accountsService.getAuthHeaders(accountState);
        const url = `${this.getBaseUrl()}:streamGenerateContent?alt=sse`;
        const host = new URL(url).host;

        const response: AxiosResponse<Readable> = await axios.post(
          url,
          antigravityRequest,
          {
            headers: {
              ...headers,
              Host: host,
              Accept: 'text/event-stream',
              'User-Agent': USER_AGENT,
            },
            responseType: 'stream',
          },
        );

        this.accountsService.markSuccess(accountState.id);

        let isFirst = true;
        let buffer = '';
        const stream = response.data;

        const accumulator =
          this.anthropicTransformerService.createStreamAccumulator(
            messageId,
            dto.model,
          );

        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => {
            if (res.writableEnded || res.destroyed) {
              return;
            }

            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();

                if (res.writableEnded || res.destroyed) {
                  return;
                }

                if (data === '[DONE]') {
                  return;
                }

                try {
                  const parsed = JSON.parse(data) as AntigravityStreamChunk;
                  const events =
                    this.anthropicTransformerService.transformStreamChunk(
                      parsed,
                      accumulator,
                      isFirst,
                    );

                  for (const event of events) {
                    if (!res.writableEnded && !res.destroyed) {
                      res.write(
                        `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                      );
                    }
                  }

                  if (events.length > 0) {
                    isFirst = false;
                  }
                } catch {
                  this.logger.warn(`Failed to parse chunk: ${data}`);
                }
              }
            }
          });

          stream.on('end', () => {
            if (!res.writableEnded && !res.destroyed) {
              const finalEvents =
                this.anthropicTransformerService.createFinalEvents(accumulator);
              for (const event of finalEvents) {
                res.write(
                  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                );
              }
              res.end();
            }
            resolve();
          });

          stream.on('error', (error: Error) => {
            this.logger.error(`Stream error: ${error.message}`);
            if (!res.writableEnded && !res.destroyed) {
              const errorEvent = {
                type: 'error',
                error: { type: 'api_error', message: error.message },
              };
              res.write(
                `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`,
              );
              res.end();
            }
            reject(error);
          });
        });

        return;
      } catch (error) {
        if (this.isRateLimitError(error) && !res.headersSent) {
          this.accountsService.markCooldown(accountState.id);
          this.logger.warn(
            `Rate limited on account ${accountState.id} (${accountState.credential.email}), trying next account...`,
          );
          continue;
        }
        await this.handleAnthropicStreamError(error, res);
        return;
      }
    }

    throw new HttpException(
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'All retry attempts exhausted due to rate limiting.',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof HttpException) {
      return error.getStatus() === 429;
    }
    if (axios.isAxiosError(error)) {
      return error.response?.status === 429;
    }
    return false;
  }

  private async handleAnthropicStreamError(
    error: unknown,
    res: Response,
  ): Promise<void> {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status ?? 500;
    let message = (error as Error).message;

    if (axiosError.response?.data) {
      try {
        const responseData = axiosError.response.data as
          | AsyncIterable<Buffer>
          | AntigravityError;

        if (
          responseData &&
          typeof (responseData as { on?: unknown }).on === 'function'
        ) {
          const chunks: Buffer[] = [];
          for await (const chunk of responseData as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const body = Buffer.concat(chunks).toString('utf-8');
          this.logger.error(`Streaming error body: ${body}`);

          try {
            const parsed = JSON.parse(body) as AntigravityError;
            message = parsed?.error?.message ?? message;
          } catch {
            if (body.length < 500) {
              message = body || message;
            }
          }
        } else if (typeof responseData === 'object') {
          const data = responseData as AntigravityError;
          message = data?.error?.message ?? message;
        }
      } catch (readError) {
        this.logger.warn(
          `Could not read error response: ${(readError as Error).message}`,
        );
      }
    }

    this.logger.error(`Anthropic streaming error (${status}): ${message}`);

    const errorResponse = {
      type: 'error',
      error: {
        type: this.mapAnthropicErrorType(status),
        message,
      },
    };

    if (!res.headersSent) {
      res.status(status).json(errorResponse);
    } else if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }

  private mapAnthropicErrorType(status: number): string {
    switch (status) {
      case 400:
        return 'invalid_request_error';
      case 401:
        return 'authentication_error';
      case 403:
        return 'permission_error';
      case 404:
        return 'not_found_error';
      case 429:
        return 'rate_limit_error';
      case 500:
      case 502:
      case 503:
        return 'api_error';
      case 529:
        return 'overloaded_error';
      default:
        return 'api_error';
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    data: unknown,
    accountState: AccountState,
  ): Promise<T> {
    const headers = await this.accountsService.getAuthHeaders(accountState);

    for (let i = 0; i < BASE_URLS.length; i++) {
      const baseUrl =
        BASE_URLS[(this.currentBaseUrlIndex + i) % BASE_URLS.length];
      const url = `${baseUrl}${endpoint}`;

      try {
        this.logger.debug(`Making request to: ${url}`);

        const response = await axios.post<T>(url, data, {
          headers: {
            ...headers,
            'User-Agent': USER_AGENT,
          },
          timeout: 120000,
        });

        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError<AntigravityError>;

        if (axiosError.response?.status === 429) {
          throw this.createHttpException(axiosError);
        }

        if (axiosError.response?.status === 401) {
          try {
            await this.accountsService.refreshToken(accountState);
            const newHeaders =
              await this.accountsService.getAuthHeaders(accountState);
            const response = await axios.post<T>(url, data, {
              headers: { ...newHeaders, 'User-Agent': USER_AGENT },
              timeout: 120000,
            });
            return response.data;
          } catch {
            throw new HttpException(
              'Authentication failed',
              HttpStatus.UNAUTHORIZED,
            );
          }
        }

        this.logger.warn(`Request to ${baseUrl} failed: ${axiosError.message}`);
        if (i === BASE_URLS.length - 1) {
          throw this.createHttpException(axiosError);
        }

        this.currentBaseUrlIndex =
          (this.currentBaseUrlIndex + 1) % BASE_URLS.length;
      }
    }

    throw new HttpException('All API endpoints failed', HttpStatus.BAD_GATEWAY);
  }

  private getBaseUrl(): string {
    return BASE_URLS[this.currentBaseUrlIndex];
  }

  private createHttpException(
    error: AxiosError<AntigravityError>,
  ): HttpException {
    const status = error.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message = error.response?.data?.error?.message ?? error.message;
    const errorCode = this.mapHttpStatusToErrorCode(status);

    return new HttpException(
      {
        error: {
          message,
          type: this.mapErrorType(status),
          param: null,
          code: errorCode,
        },
      },
      status,
    );
  }

  private mapErrorType(status: number): string {
    switch (status) {
      case 400:
        return 'invalid_request_error';
      case 401:
        return 'authentication_error';
      case 403:
        return 'permission_error';
      case 404:
        return 'invalid_request_error';
      case 429:
        return 'rate_limit_error';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'server_error';
      default:
        return 'server_error';
    }
  }

  private mapHttpStatusToErrorCode(status: number): string | null {
    switch (status) {
      case 400:
        return 'invalid_request_error';
      case 401:
        return 'invalid_api_key';
      case 404:
        return 'model_not_found';
      case 429:
        return 'rate_limit_exceeded';
      case 500:
        return 'server_error';
      case 503:
        return 'engine_overloaded';
      case 504:
        return 'timeout';
      default:
        return null;
    }
  }

  private async handleStreamError(
    error: unknown,
    res: Response,
  ): Promise<void> {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status ?? 500;
    let message = (error as Error).message;

    if (axiosError.response?.data) {
      try {
        const responseData = axiosError.response.data as
          | AsyncIterable<Buffer>
          | AntigravityError;

        if (
          responseData &&
          typeof (responseData as { on?: unknown }).on === 'function'
        ) {
          const chunks: Buffer[] = [];
          for await (const chunk of responseData as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const body = Buffer.concat(chunks).toString('utf-8');
          this.logger.error(`Streaming error body: ${body}`);

          try {
            const parsed = JSON.parse(body) as AntigravityError;
            message = parsed?.error?.message ?? message;
          } catch {
            if (body.length < 500) {
              message = body || message;
            }
          }
        } else if (typeof responseData === 'object') {
          const data = responseData as AntigravityError;
          message = data?.error?.message ?? message;
        }
      } catch (readError) {
        this.logger.warn(
          `Could not read error response: ${(readError as Error).message}`,
        );
      }
    }

    this.logger.error(`Streaming error (${status}): ${message}`);

    const errorResponse = {
      error: {
        message,
        type: this.mapErrorType(status),
        param: null,
        code: this.mapHttpStatusToErrorCode(status),
      },
    };

    if (!res.headersSent) {
      res.status(status).json(errorResponse);
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }
}
