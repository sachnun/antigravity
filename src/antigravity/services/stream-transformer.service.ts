import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ChatCompletionChunk,
  ChatCompletionChoice,
  ChatCompletionChunkChoice,
  ToolCallResponse,
  ToolCallDelta,
} from '../dto/chat-completion-response.dto';
import {
  AntigravityStreamChunk,
  AntigravityResponsePart,
} from '../interfaces/antigravity-response.interface';

/**
 * Interface representing the state of stream accumulation.
 * Used to track content and tool calls across multiple stream chunks.
 */
export interface StreamAccumulator {
  /** Accumulated reasoning/thinking content */
  reasoningContent: string;
  /** Signature for thought verification */
  thoughtSignature: string;
  /** Accumulated text content */
  textContent: string;
  /** Map of tool calls by index */
  toolCalls: Map<number, ToolCallResponse>;
  /** Current tool call index */
  toolIdx: number;
  /** Whether any tool calls have been received */
  hasToolCalls: boolean;
  /** Whether the stream is complete */
  isComplete: boolean;
  /** The accumulated finish reason */
  accumulatedFinishReason: string | null;
}

/**
 * Service responsible for transforming Antigravity streaming responses
 * into OpenAI-compatible SSE chunks.
 */
@Injectable()
export class StreamTransformerService {
  /**
   * Creates a new stream accumulator for tracking state across chunks.
   *
   * @returns A fresh StreamAccumulator instance
   */
  createStreamAccumulator(): StreamAccumulator {
    return {
      reasoningContent: '',
      thoughtSignature: '',
      textContent: '',
      toolCalls: new Map(),
      toolIdx: 0,
      hasToolCalls: false,
      isComplete: false,
      accumulatedFinishReason: null,
    };
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
    const hasUsage =
      chunk.response?.usageMetadata &&
      chunk.response.usageMetadata.candidatesTokenCount > 0;

    if (!chunk.response?.candidates?.[0]) {
      if (hasUsage) {
        accumulator.isComplete = true;
        const finalFinishReason = this.determineFinalFinishReason(accumulator);

        return {
          id: requestId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          system_fingerprint: null,
          choices: [
            {
              index: 0,
              delta: {},
              logprobs: null,
              finish_reason: finalFinishReason,
            },
          ],
          usage: {
            prompt_tokens: chunk.response.usageMetadata!.promptTokenCount,
            completion_tokens:
              chunk.response.usageMetadata!.candidatesTokenCount,
            total_tokens: chunk.response.usageMetadata!.totalTokenCount,
          },
        };
      }
      return null;
    }

    const candidate = chunk.response.candidates[0];
    const parts = candidate.content?.parts || [];

    const { content, toolCalls, reasoningContent, thoughtSignature } =
      this.extractStreamContent(parts);

    if (content) accumulator.textContent += content;
    if (reasoningContent) accumulator.reasoningContent += reasoningContent;
    if (thoughtSignature) accumulator.thoughtSignature = thoughtSignature;

    if (toolCalls.length > 0) {
      accumulator.hasToolCalls = true;
      accumulator.accumulatedFinishReason = 'tool_calls';

      for (const tc of toolCalls) {
        const existingTc = accumulator.toolCalls.get(accumulator.toolIdx);
        if (existingTc) {
          existingTc.function.arguments += tc.function.arguments;
        } else {
          accumulator.toolCalls.set(accumulator.toolIdx, tc);
        }
        accumulator.toolIdx++;
      }
    }

    if (candidate.finishReason) {
      const mappedReason = this.mapFinishReason(candidate.finishReason);
      if (!accumulator.accumulatedFinishReason) {
        accumulator.accumulatedFinishReason = mappedReason;
      }
    }

    const delta: ChatCompletionChunkChoice['delta'] = {};
    if (isFirst) delta.role = 'assistant';
    if (content) delta.content = content;
    if (reasoningContent) delta.reasoning_content = reasoningContent;
    if (toolCalls.length > 0) {
      delta.tool_calls = toolCalls.map(
        (tc, i): ToolCallDelta => ({
          index: accumulator.toolIdx - toolCalls.length + i,
          id: tc.id,
          type: tc.type,
          function: tc.function,
        }),
      );
    }

    if (hasUsage) {
      accumulator.isComplete = true;
      const finalFinishReason = this.determineFinalFinishReason(accumulator);

      return {
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        system_fingerprint: null,
        choices: [
          {
            index: 0,
            delta,
            logprobs: null,
            finish_reason: finalFinishReason,
          },
        ],
        usage: {
          prompt_tokens: chunk.response.usageMetadata!.promptTokenCount,
          completion_tokens: chunk.response.usageMetadata!.candidatesTokenCount,
          total_tokens: chunk.response.usageMetadata!.totalTokenCount,
        },
      };
    }

    return {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      system_fingerprint: null,
      choices: [
        {
          index: 0,
          delta,
          logprobs: null,
          finish_reason: null,
        },
      ],
    };
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
    accumulator.isComplete = true;
    const finalFinishReason = this.determineFinalFinishReason(accumulator);

    return {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      system_fingerprint: null,
      choices: [
        {
          index: 0,
          delta: {},
          logprobs: null,
          finish_reason: finalFinishReason,
        },
      ],
    };
  }

  /**
   * Determines the final finish reason based on accumulated state.
   */
  private determineFinalFinishReason(
    accumulator: StreamAccumulator,
  ): ChatCompletionChoice['finish_reason'] {
    if (accumulator.hasToolCalls) {
      return 'tool_calls';
    }
    if (accumulator.accumulatedFinishReason === 'length') {
      return 'length';
    }
    if (accumulator.accumulatedFinishReason === 'content_filter') {
      return 'content_filter';
    }
    return 'stop';
  }

  /**
   * Extracts content, tool calls, and reasoning from stream parts.
   */
  private extractStreamContent(parts: AntigravityResponsePart[]): {
    content: string;
    toolCalls: ToolCallResponse[];
    reasoningContent: string;
    thoughtSignature: string;
  } {
    let content = '';
    let reasoningContent = '';
    let thoughtSignature = '';
    const toolCalls: ToolCallResponse[] = [];

    for (const part of parts) {
      if (part.text) {
        if (part.thought) {
          reasoningContent += part.text;
        } else {
          content += part.text;
        }
      }
      if (part.thoughtSignature) {
        thoughtSignature = part.thoughtSignature;
      }
      if (part.functionCall) {
        const funcCall = part.functionCall;
        toolCalls.push({
          id: funcCall.id || `call_${uuidv4().replace(/-/g, '').slice(0, 24)}`,
          type: 'function',
          function: {
            name: funcCall.name,
            arguments: JSON.stringify(funcCall.args || {}),
          },
        });
      }
    }

    return { content, toolCalls, reasoningContent, thoughtSignature };
  }

  /**
   * Maps Antigravity finish reasons to OpenAI finish reasons.
   */
  private mapFinishReason(
    reason?: string,
  ): ChatCompletionChoice['finish_reason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
