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
import { QuotaService } from '../quota/quota.service';
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
import { SSEStreamParser } from '../common/utils';
import { QuotaStatusResponse } from '../quota/interfaces';

type ApiType = 'openai' | 'anthropic';

@Injectable()
export class AntigravityService {
  private readonly logger = new Logger(AntigravityService.name);
  private currentBaseUrlIndex = 0;
  private readonly maxRetryAccounts: number;

  constructor(
    private readonly accountsService: AccountsService,
    private readonly transformerService: TransformerService,
    private readonly anthropicTransformerService: AnthropicTransformerService,
    private readonly quotaService: QuotaService,
    private readonly configService: ConfigService,
  ) {
    this.maxRetryAccounts =
      this.configService.get<number>('accounts.maxRetryAccounts') || 3;
  }

  private checkAccountsExist(): void {
    if (!this.accountsService.hasAccounts()) {
      throw new HttpException(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private createRateLimitError(
    apiType: ApiType,
    retryAfter?: number,
  ): HttpException {
    if (apiType === 'anthropic') {
      return new HttpException(
        {
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: retryAfter
              ? `All accounts are rate limited. Retry after ${retryAfter} seconds.`
              : 'All accounts are rate limited. Please try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return new HttpException(
      {
        error: {
          message: retryAfter
            ? `All accounts are rate limited. Retry after ${retryAfter} seconds.`
            : 'All retry attempts exhausted due to rate limiting.',
          type: 'rate_limit_error',
          param: null,
          code: 'rate_limit_exceeded',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getRetryAfterSeconds(): number {
    const earliestCooldown = this.accountsService.getEarliestCooldownEnd();
    return earliestCooldown
      ? Math.ceil((earliestCooldown - Date.now()) / 1000)
      : 60;
  }

  private async withAccountRetry<T>(
    operation: (accountState: AccountState) => Promise<T>,
    apiType: ApiType,
    res?: Response,
  ): Promise<T> {
    const maxAttempts = Math.min(
      this.maxRetryAccounts,
      this.accountsService.getAccountCount(),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const accountState = this.accountsService.getNextAccount();

      if (!accountState) {
        const retryAfter = this.getRetryAfterSeconds();
        if (res) {
          res.setHeader('Retry-After', String(retryAfter));
        }
        throw this.createRateLimitError(apiType, retryAfter);
      }

      try {
        return await operation(accountState);
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

    throw this.createRateLimitError(apiType);
  }

  private setSSEHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  private async createStreamRequest(
    data: unknown,
    accountState: AccountState,
  ): Promise<Readable> {
    const headers = await this.accountsService.getAuthHeaders(accountState);
    const url = `${this.getBaseUrl()}:streamGenerateContent?alt=sse`;
    const host = new URL(url).host;

    const response: AxiosResponse<Readable> = await axios.post(url, data, {
      headers: {
        ...headers,
        Host: host,
        Accept: 'text/event-stream',
        'User-Agent': USER_AGENT,
      },
      responseType: 'stream',
    });

    return response.data;
  }

  private async processStream(
    stream: Readable,
    res: Response,
    handlers: {
      onData: (data: string) => void;
      onEnd: () => void;
      onError: (error: Error) => void;
      parser: SSEStreamParser;
    },
  ): Promise<void> {
    const { onData, onEnd, onError, parser } = handlers;

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        if (res.writableEnded || res.destroyed) {
          return;
        }

        const dataLines = parser.parseChunk(chunk);
        for (const data of dataLines) {
          if (res.writableEnded || res.destroyed) {
            return;
          }

          try {
            onData(data);
          } catch {
            this.logger.warn(`Failed to parse chunk: ${data}`);
          }
        }

        if (parser.isDone(chunk)) {
          return;
        }
      });

      stream.on('end', () => {
        if (!res.writableEnded && !res.destroyed) {
          onEnd();
          res.end();
        }
        resolve();
      });

      stream.on('error', (error: Error) => {
        this.logger.error(`Stream error: ${error.message}`);
        if (!res.writableEnded && !res.destroyed) {
          onError(error);
          res.end();
        }
        reject(error);
      });
    });
  }

  async chatCompletion(
    dto: ChatCompletionRequestDto,
  ): Promise<ChatCompletionResponse> {
    this.checkAccountsExist();
    const requestId = `chatcmpl-${uuidv4()}`;

    return this.withAccountRetry(async (accountState) => {
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
    }, 'openai');
  }

  async chatCompletionStream(
    dto: ChatCompletionRequestDto,
    res: Response,
  ): Promise<void> {
    this.checkAccountsExist();
    const requestId = `chatcmpl-${uuidv4()}`;

    await this.withAccountRetry(
      async (accountState) => {
        const projectId = await this.accountsService.getProjectId(accountState);
        const antigravityRequest = this.transformerService.transformRequest(
          dto,
          projectId,
        );

        this.setSSEHeaders(res);

        this.logger.debug(
          `Streaming chat completion: model=${dto.model}, account=${accountState.id} (${accountState.credential.email})`,
        );

        const stream = await this.createStreamRequest(
          antigravityRequest,
          accountState,
        );
        this.accountsService.markSuccess(accountState.id);

        const parser = new SSEStreamParser();
        let isFirst = true;
        const accumulator = this.transformerService.createStreamAccumulator();

        await this.processStream(stream, res, {
          onData: (data) => {
            const parsed = JSON.parse(data) as AntigravityStreamChunk;
            const transformed = this.transformerService.transformStreamChunk(
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
          },
          onEnd: () => {
            if (!accumulator.isComplete) {
              const finalChunk = this.transformerService.createFinalChunk(
                requestId,
                dto.model,
                accumulator,
              );
              res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            }
            res.write('data: [DONE]\n\n');
          },
          onError: (error) => {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          },
          parser,
        });
      },
      'openai',
      res,
    ).catch(async (error) => {
      if (!res.headersSent) {
        throw error;
      }
      await this.handleStreamError(error, res);
    });
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

  async getQuotaStatus(): Promise<QuotaStatusResponse> {
    const readyAccounts = this.accountsService.getReadyAccounts();

    await Promise.allSettled(
      readyAccounts.map((account) => this.refreshAccountQuota(account)),
    );

    const accounts = this.accountsService.getAccountsForQuotaStatus();
    return this.quotaService.getQuotaStatus(accounts);
  }

  private async refreshAccountQuota(accountState: AccountState): Promise<void> {
    try {
      const accessToken =
        await this.accountsService.getAccessToken(accountState);
      const projectId = await this.accountsService.getProjectId(accountState);
      await this.quotaService.fetchQuotaFromUpstream(
        accountState,
        accessToken,
        projectId,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to refresh quota for account ${accountState.id}: ${errorMessage}`,
      );
    }
  }

  async anthropicMessages(
    dto: AnthropicMessagesRequestDto,
    messageId: string,
  ): Promise<AnthropicMessagesResponse> {
    this.checkAccountsExist();

    return this.withAccountRetry(async (accountState) => {
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
    }, 'anthropic');
  }

  async anthropicMessagesStream(
    dto: AnthropicMessagesRequestDto,
    res: Response,
    messageId: string,
  ): Promise<void> {
    this.checkAccountsExist();

    await this.withAccountRetry(
      async (accountState) => {
        const projectId = await this.accountsService.getProjectId(accountState);
        const antigravityRequest =
          this.anthropicTransformerService.transformRequest(dto, projectId);

        this.setSSEHeaders(res);

        this.logger.debug(
          `Streaming Anthropic messages: model=${dto.model}, account=${accountState.id} (${accountState.credential.email})`,
        );

        const stream = await this.createStreamRequest(
          antigravityRequest,
          accountState,
        );
        this.accountsService.markSuccess(accountState.id);

        const parser = new SSEStreamParser();
        let isFirst = true;
        const accumulator =
          this.anthropicTransformerService.createStreamAccumulator(
            messageId,
            dto.model,
          );

        await this.processStream(stream, res, {
          onData: (data) => {
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
          },
          onEnd: () => {
            const finalEvents =
              this.anthropicTransformerService.createFinalEvents(accumulator);
            for (const event of finalEvents) {
              res.write(
                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
              );
            }
          },
          onError: (error) => {
            const errorEvent = {
              type: 'error',
              error: { type: 'api_error', message: error.message },
            };
            res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
          },
          parser,
        });
      },
      'anthropic',
      res,
    ).catch(async (error) => {
      if (!res.headersSent) {
        throw error;
      }
      await this.handleAnthropicStreamError(error, res);
    });
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
    await this.handleStreamErrorInternal(error, res, 'anthropic');
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

  private async extractErrorMessage(
    error: unknown,
  ): Promise<{ status: number; message: string }> {
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

    return { status, message };
  }

  private async handleStreamErrorInternal(
    error: unknown,
    res: Response,
    apiType: ApiType,
  ): Promise<void> {
    const { status, message } = await this.extractErrorMessage(error);

    this.logger.error(
      `${apiType === 'anthropic' ? 'Anthropic s' : 'S'}treaming error (${status}): ${message}`,
    );

    let errorResponse: unknown;
    let dataPrefix: string;

    if (apiType === 'anthropic') {
      errorResponse = {
        type: 'error',
        error: {
          type: this.mapAnthropicErrorType(status),
          message,
        },
      };
      dataPrefix = 'event: error\ndata: ';
    } else {
      errorResponse = {
        error: {
          message,
          type: this.mapErrorType(status),
          param: null,
          code: this.mapHttpStatusToErrorCode(status),
        },
      };
      dataPrefix = 'data: ';
    }

    if (!res.headersSent) {
      res.status(status).json(errorResponse);
    } else if (!res.writableEnded) {
      res.write(`${dataPrefix}${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    }
  }

  private async handleStreamError(
    error: unknown,
    res: Response,
  ): Promise<void> {
    await this.handleStreamErrorInternal(error, res, 'openai');
  }
}
