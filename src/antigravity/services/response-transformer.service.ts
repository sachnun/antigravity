import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ChatCompletionResponse,
  ChatCompletionChoice,
  ToolCallResponse,
} from '../dto/chat-completion-response.dto';
import {
  AntigravityResponse,
  AntigravityResponsePart,
} from '../interfaces/antigravity-response.interface';

/**
 * Service responsible for transforming Antigravity API responses
 * into OpenAI-compatible response format.
 */
@Injectable()
export class ResponseTransformerService {
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
    const candidate = response.response.candidates[0];
    const { content, toolCalls, reasoningContent } = this.extractContent(
      candidate?.content?.parts || [],
    );

    const choice: ChatCompletionChoice = {
      index: 0,
      message: {
        role: 'assistant',
        content: content || null,
      },
      logprobs: null,
      finish_reason: this.mapFinishReason(candidate?.finishReason),
    };

    if (toolCalls.length > 0) {
      choice.message.tool_calls = toolCalls;
      choice.finish_reason = 'tool_calls';
    }

    if (reasoningContent) {
      choice.message.reasoning_content = reasoningContent;
    }

    return {
      id: requestId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      system_fingerprint: null,
      choices: [choice],
      usage: response.response.usageMetadata
        ? {
            prompt_tokens: response.response.usageMetadata.promptTokenCount,
            completion_tokens:
              response.response.usageMetadata.candidatesTokenCount,
            total_tokens: response.response.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  /**
   * Extracts content, tool calls, and reasoning from Antigravity response parts.
   *
   * @param parts - Array of Antigravity response parts
   * @returns Extracted content, tool calls, and reasoning content
   */
  extractContent(parts: AntigravityResponsePart[]): {
    content: string;
    toolCalls: ToolCallResponse[];
    reasoningContent: string;
  } {
    let content = '';
    let reasoningContent = '';
    const toolCalls: ToolCallResponse[] = [];

    for (const part of parts) {
      if (part.text) {
        if (part.thought) {
          reasoningContent += part.text;
        } else {
          content += part.text;
        }
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

    return { content, toolCalls, reasoningContent };
  }

  /**
   * Maps Antigravity finish reasons to OpenAI finish reasons.
   *
   * @param reason - The Antigravity finish reason
   * @returns OpenAI-compatible finish reason
   */
  mapFinishReason(reason?: string): ChatCompletionChoice['finish_reason'] {
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
