import { Injectable } from '@nestjs/common';
import { ChatCompletionRequestDto } from '../dto';
import {
  ChatCompletionResponse,
  ChatCompletionChunk,
} from '../dto/chat-completion-response.dto';
import { AntigravityRequest } from '../interfaces';
import {
  AntigravityResponse,
  AntigravityStreamChunk,
} from '../interfaces/antigravity-response.interface';
import { RequestTransformerService } from './request-transformer.service';
import { ResponseTransformerService } from './response-transformer.service';
import {
  StreamTransformerService,
  StreamAccumulator,
} from './stream-transformer.service';

// Re-export StreamAccumulator for backward compatibility
export type { StreamAccumulator } from './stream-transformer.service';

/**
 * Facade service that coordinates request, response, and stream transformations.
 * Provides a unified interface for transforming between OpenAI and Antigravity formats.
 *
 * @remarks
 * This service delegates to specialized transformer services:
 * - RequestTransformerService: Handles request transformation
 * - ResponseTransformerService: Handles response transformation
 * - StreamTransformerService: Handles streaming response transformation
 */
@Injectable()
export class TransformerService {
  constructor(
    private readonly requestTransformer: RequestTransformerService,
    private readonly responseTransformer: ResponseTransformerService,
    private readonly streamTransformer: StreamTransformerService,
  ) {}

  /**
   * Transforms an OpenAI-compatible chat completion request into Antigravity format.
   *
   * @param dto - The incoming chat completion request DTO
   * @param projectId - The Google Cloud project ID for the request
   * @returns Transformed request in Antigravity API format
   */
  transformRequest(
    dto: ChatCompletionRequestDto,
    projectId: string,
  ): AntigravityRequest {
    return this.requestTransformer.transformRequest(dto, projectId);
  }

  /**
   * Transforms an Antigravity API response into OpenAI-compatible format.
   *
   * @param response - The raw Antigravity API response
   * @param model - The model name to include in the response
   * @param requestId - The unique request identifier
   * @returns OpenAI-compatible chat completion response
   */
  transformResponse(
    response: AntigravityResponse,
    model: string,
    requestId: string,
  ): ChatCompletionResponse {
    return this.responseTransformer.transformResponse(
      response,
      model,
      requestId,
    );
  }

  /**
   * Creates a new stream accumulator for tracking state across chunks.
   *
   * @returns A fresh StreamAccumulator instance
   */
  createStreamAccumulator(): StreamAccumulator {
    return this.streamTransformer.createStreamAccumulator();
  }

  /**
   * Transforms an Antigravity stream chunk into OpenAI-compatible format.
   *
   * @param chunk - The incoming Antigravity stream chunk
   * @param model - The model name for the response
   * @param requestId - The unique request identifier
   * @param isFirst - Whether this is the first chunk in the stream
   * @param accumulator - The stream accumulator for tracking state
   * @returns OpenAI-compatible chunk or null if no meaningful content
   */
  transformStreamChunk(
    chunk: AntigravityStreamChunk,
    model: string,
    requestId: string,
    isFirst: boolean,
    accumulator: StreamAccumulator,
  ): ChatCompletionChunk | null {
    return this.streamTransformer.transformStreamChunk(
      chunk,
      model,
      requestId,
      isFirst,
      accumulator,
    );
  }

  /**
   * Creates the final chunk to signal stream completion.
   *
   * @param requestId - The unique request identifier
   * @param model - The model name for the response
   * @param accumulator - The stream accumulator with final state
   * @returns The final completion chunk
   */
  createFinalChunk(
    requestId: string,
    model: string,
    accumulator: StreamAccumulator,
  ): ChatCompletionChunk {
    return this.streamTransformer.createFinalChunk(
      requestId,
      model,
      accumulator,
    );
  }
}
