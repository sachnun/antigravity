import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  AnthropicMessagesRequestDto,
  AnthropicContentBlock,
} from '../dto/anthropic-messages-request.dto';
import {
  AnthropicMessagesResponse,
  AnthropicResponseContent,
  AnthropicStopReason,
  AnthropicStreamEvent,
  AnthropicUsage,
} from '../dto/anthropic-messages-response.dto';
import {
  AntigravityRequest,
  AntigravityContent,
  AntigravityPart,
  AntigravityTool,
  AntigravityToolConfig,
  AntigravityGenerationConfig,
  AntigravityFunctionDeclaration,
} from '../interfaces';
import {
  AntigravityResponse,
  AntigravityStreamChunk,
  AntigravityResponsePart,
} from '../interfaces/antigravity-response.interface';
import {
  DEFAULT_SAFETY_SETTINGS,
  USER_AGENT,
  MODEL_ALIAS_MAP,
} from '../constants';
import { cleanSchemaForClaude, generateSessionId } from '../../common/utils';

export interface AnthropicStreamAccumulator {
  messageId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  contentBlocks: AnthropicResponseContent[];
  currentBlockIndex: number;
  currentToolInputJson: string;
  stopReason: AnthropicStopReason;
  isComplete: boolean;
}

@Injectable()
export class AnthropicTransformerService {
  transformRequest(
    dto: AnthropicMessagesRequestDto,
    projectId: string,
  ): AntigravityRequest {
    const { systemInstruction, contents } = this.transformMessages(
      dto.messages,
      dto.system,
    );
    const internalModel = this.getInternalModel(dto.model, dto.thinking);

    const request: AntigravityRequest = {
      project: projectId,
      userAgent: USER_AGENT,
      requestId: `agent-${uuidv4()}`,
      model: internalModel,
      request: {
        sessionId: generateSessionId(),
        contents,
        safetySettings: DEFAULT_SAFETY_SETTINGS,
      },
    };

    if (systemInstruction) {
      request.request.systemInstruction = systemInstruction;
    }

    request.request.generationConfig = this.buildGenerationConfig(dto);

    if (dto.tools && dto.tools.length > 0) {
      request.request.tools = this.transformTools(dto.tools, dto.model);
      request.request.toolConfig = this.transformToolChoice(dto.tool_choice);
    }

    return request;
  }

  private getInternalModel(
    model: string,
    thinking?: { type: 'enabled' | 'disabled'; budget_tokens?: number },
  ): string {
    const isThinking = thinking?.type === 'enabled';

    if (model === 'claude-opus-4-5') {
      return isThinking ? 'claude-opus-4-5-thinking' : 'claude-opus-4-5';
    }

    if (model === 'claude-sonnet-4-5') {
      return isThinking ? 'claude-sonnet-4-5-thinking' : 'claude-sonnet-4-5';
    }

    return MODEL_ALIAS_MAP[model] || model;
  }

  private transformMessages(
    messages: AnthropicMessagesRequestDto['messages'],
    systemPrompt?: string,
  ): {
    systemInstruction: { role: 'user'; parts: Array<{ text: string }> } | null;
    contents: AntigravityContent[];
  } {
    let systemInstruction: {
      role: 'user';
      parts: Array<{ text: string }>;
    } | null = null;

    if (systemPrompt) {
      systemInstruction = { role: 'user', parts: [{ text: systemPrompt }] };
    }

    const contents: AntigravityContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        contents.push(this.transformUserMessage(msg.content));
      } else if (msg.role === 'assistant') {
        contents.push(this.transformAssistantMessage(msg.content));
      }
    }

    return { systemInstruction, contents };
  }

  private transformUserMessage(
    content: string | AnthropicContentBlock[],
  ): AntigravityContent {
    const parts: AntigravityPart[] = [];

    if (typeof content === 'string') {
      parts.push({ text: content });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && 'text' in block) {
          parts.push({ text: (block as { type: 'text'; text: string }).text });
        } else if (block.type === 'image') {
          const src = block.source;
          if (src.type === 'base64') {
            parts.push({
              inlineData: {
                mimeType: src.media_type || 'image/png',
                data: src.data,
              },
            });
          }
        } else if (block.type === 'tool_result') {
          let resultContent: unknown;
          if (typeof block.content === 'string') {
            try {
              resultContent = JSON.parse(block.content);
            } catch {
              resultContent = { output: block.content };
            }
          } else if (Array.isArray(block.content)) {
            const textParts = block.content
              .filter((b) => b.type === 'text')
              .map((b) => (b as { type: 'text'; text: string }).text)
              .join('\n');
            try {
              resultContent = JSON.parse(textParts);
            } catch {
              resultContent = { output: textParts };
            }
          } else {
            resultContent = { output: '' };
          }

          parts.push({
            functionResponse: {
              name: 'tool_result',
              response: { result: resultContent },
              id: block.tool_use_id,
            },
          });
        }
      }
    }

    return { role: 'user', parts };
  }

  private transformAssistantMessage(
    content: string | AnthropicContentBlock[],
  ): AntigravityContent {
    const parts: AntigravityPart[] = [];

    if (typeof content === 'string') {
      parts.push({ text: content });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input,
              id: block.id,
            },
          });
        }
      }
    }

    return { role: 'model', parts };
  }

  private buildGenerationConfig(
    dto: AnthropicMessagesRequestDto,
  ): AntigravityGenerationConfig {
    const config: AntigravityGenerationConfig = {};

    if (dto.temperature !== undefined) config.temperature = dto.temperature;
    if (dto.top_p !== undefined) config.topP = dto.top_p;
    if (dto.top_k) config.topK = dto.top_k;
    if (dto.max_tokens) config.maxOutputTokens = dto.max_tokens;
    if (dto.stop_sequences?.length) config.stopSequences = dto.stop_sequences;

    if (dto.thinking?.type === 'enabled') {
      config.thinkingConfig = {
        thinkingBudget: dto.thinking.budget_tokens || 16384,
        include_thoughts: true,
      };
    }

    return config;
  }

  private transformTools(
    tools: AnthropicMessagesRequestDto['tools'],
    model: string,
  ): AntigravityTool[] {
    if (!tools) return [];

    const isClaude = model.includes('claude');
    const functionDeclarations: AntigravityFunctionDeclaration[] = tools.map(
      (tool) => {
        const decl: AntigravityFunctionDeclaration = {
          name: tool.name,
          description: tool.description,
        };

        if (tool.input_schema) {
          const schema = tool.input_schema as unknown as Record<
            string,
            unknown
          >;
          if (isClaude) {
            decl.parameters = cleanSchemaForClaude(schema);
          } else {
            decl.parametersJsonSchema = schema;
          }
        }

        return decl;
      },
    );

    return [{ functionDeclarations }];
  }

  private transformToolChoice(
    toolChoice?: AnthropicMessagesRequestDto['tool_choice'],
  ): AntigravityToolConfig {
    if (!toolChoice || toolChoice.type === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }
    if (toolChoice.type === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }
    if (toolChoice.type === 'any') {
      return { functionCallingConfig: { mode: 'ANY' } };
    }
    if (toolChoice.type === 'tool' && 'name' in toolChoice) {
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [toolChoice.name],
        },
      };
    }
    return { functionCallingConfig: { mode: 'AUTO' } };
  }

  transformResponse(
    response: AntigravityResponse,
    model: string,
    messageId: string,
  ): AnthropicMessagesResponse {
    const candidate = response.response.candidates[0];
    const content = this.extractContent(candidate?.content?.parts || []);
    const stopReason = this.mapStopReason(
      candidate?.finishReason,
      content.some((c) => c.type === 'tool_use'),
    );

    const usage: AnthropicUsage = {
      input_tokens: response.response.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.response.usageMetadata?.candidatesTokenCount || 0,
    };

    return {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    };
  }

  private extractContent(
    parts: AntigravityResponsePart[],
  ): AnthropicResponseContent[] {
    const content: AnthropicResponseContent[] = [];

    for (const part of parts) {
      if (part.text) {
        if (part.thought) {
          content.push({ type: 'thinking', thinking: part.text });
        } else {
          content.push({ type: 'text', text: part.text });
        }
      }
      if (part.functionCall) {
        content.push({
          type: 'tool_use',
          id:
            part.functionCall.id ||
            `toolu_${uuidv4().replace(/-/g, '').slice(0, 24)}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });
      }
    }

    return content;
  }

  private mapStopReason(
    reason?: string,
    hasToolUse?: boolean,
  ): AnthropicStopReason {
    if (hasToolUse) return 'tool_use';

    switch (reason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'SAFETY':
      case 'RECITATION':
        return 'end_turn';
      default:
        return 'end_turn';
    }
  }

  createStreamAccumulator(
    messageId: string,
    model: string,
  ): AnthropicStreamAccumulator {
    return {
      messageId,
      model,
      inputTokens: 0,
      outputTokens: 0,
      contentBlocks: [],
      currentBlockIndex: -1,
      currentToolInputJson: '',
      stopReason: null,
      isComplete: false,
    };
  }

  transformStreamChunk(
    chunk: AntigravityStreamChunk,
    accumulator: AnthropicStreamAccumulator,
    isFirst: boolean,
  ): AnthropicStreamEvent[] {
    const events: AnthropicStreamEvent[] = [];

    if (isFirst) {
      events.push({
        type: 'message_start',
        message: {
          id: accumulator.messageId,
          type: 'message',
          role: 'assistant',
          model: accumulator.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
    }

    const hasUsage =
      chunk.response?.usageMetadata &&
      chunk.response.usageMetadata.candidatesTokenCount > 0;

    if (hasUsage) {
      accumulator.inputTokens =
        chunk.response.usageMetadata!.promptTokenCount || 0;
      accumulator.outputTokens =
        chunk.response.usageMetadata!.candidatesTokenCount || 0;
    }

    if (!chunk.response?.candidates?.[0]) {
      if (hasUsage) {
        accumulator.isComplete = true;
        events.push({
          type: 'message_delta',
          delta: {
            stop_reason: this.determineFinalStopReason(accumulator),
            stop_sequence: null,
          },
          usage: { output_tokens: accumulator.outputTokens },
        });
        events.push({ type: 'message_stop' });
      }
      return events;
    }

    const candidate = chunk.response.candidates[0];
    const parts = candidate.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        const blockType = part.thought ? 'thinking' : 'text';
        const existingBlockIndex = accumulator.contentBlocks.findIndex(
          (b) => b.type === blockType,
        );

        if (existingBlockIndex === -1) {
          accumulator.currentBlockIndex++;
          const newIndex = accumulator.currentBlockIndex;

          if (blockType === 'thinking') {
            accumulator.contentBlocks.push({ type: 'thinking', thinking: '' });
            events.push({
              type: 'content_block_start',
              index: newIndex,
              content_block: { type: 'thinking', thinking: '' },
            });
          } else {
            accumulator.contentBlocks.push({ type: 'text', text: '' });
            events.push({
              type: 'content_block_start',
              index: newIndex,
              content_block: { type: 'text', text: '' },
            });
          }
        }

        const blockIndex =
          existingBlockIndex !== -1
            ? existingBlockIndex
            : accumulator.currentBlockIndex;

        if (blockType === 'thinking') {
          events.push({
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'thinking_delta', thinking: part.text },
          });
          const block = accumulator.contentBlocks[blockIndex];
          if (block.type === 'thinking') {
            block.thinking += part.text;
          }
        } else {
          events.push({
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'text_delta', text: part.text },
          });
          const block = accumulator.contentBlocks[blockIndex];
          if (block.type === 'text') {
            block.text += part.text;
          }
        }
      }

      if (part.functionCall) {
        accumulator.currentBlockIndex++;
        const newIndex = accumulator.currentBlockIndex;
        const toolId =
          part.functionCall.id ||
          `toolu_${uuidv4().replace(/-/g, '').slice(0, 24)}`;

        accumulator.contentBlocks.push({
          type: 'tool_use',
          id: toolId,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });

        events.push({
          type: 'content_block_start',
          index: newIndex,
          content_block: {
            type: 'tool_use',
            id: toolId,
            name: part.functionCall.name,
            input: {},
          },
        });

        const argsJson = JSON.stringify(part.functionCall.args || {});
        events.push({
          type: 'content_block_delta',
          index: newIndex,
          delta: { type: 'input_json_delta', partial_json: argsJson },
        });

        events.push({
          type: 'content_block_stop',
          index: newIndex,
        });
      }
    }

    if (candidate.finishReason) {
      accumulator.stopReason = this.mapStopReason(
        candidate.finishReason,
        accumulator.contentBlocks.some((b) => b.type === 'tool_use'),
      );
    }

    if (hasUsage) {
      accumulator.isComplete = true;

      for (let i = 0; i <= accumulator.currentBlockIndex; i++) {
        const block = accumulator.contentBlocks[i];
        if (block.type !== 'tool_use') {
          events.push({ type: 'content_block_stop', index: i });
        }
      }

      events.push({
        type: 'message_delta',
        delta: {
          stop_reason: this.determineFinalStopReason(accumulator),
          stop_sequence: null,
        },
        usage: { output_tokens: accumulator.outputTokens },
      });
      events.push({ type: 'message_stop' });
    }

    return events;
  }

  private determineFinalStopReason(
    accumulator: AnthropicStreamAccumulator,
  ): AnthropicStopReason {
    if (accumulator.contentBlocks.some((b) => b.type === 'tool_use')) {
      return 'tool_use';
    }
    return accumulator.stopReason || 'end_turn';
  }

  createFinalEvents(
    accumulator: AnthropicStreamAccumulator,
  ): AnthropicStreamEvent[] {
    if (accumulator.isComplete) {
      return [];
    }

    const events: AnthropicStreamEvent[] = [];

    for (let i = 0; i <= accumulator.currentBlockIndex; i++) {
      events.push({ type: 'content_block_stop', index: i });
    }

    events.push({
      type: 'message_delta',
      delta: {
        stop_reason: this.determineFinalStopReason(accumulator),
        stop_sequence: null,
      },
      usage: { output_tokens: accumulator.outputTokens },
    });
    events.push({ type: 'message_stop' });

    return events;
  }
}
