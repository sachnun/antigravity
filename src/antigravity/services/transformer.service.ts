import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChatCompletionRequestDto, MessageDto, ToolDto } from '../dto';
import {
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionChoice,
  ToolCallResponse,
  ChatCompletionChunkChoice,
  ToolCallDelta,
} from '../dto/chat-completion-response.dto';
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
  THINKING_LEVEL_MODELS,
  THINKING_BUDGETS,
  DEFAULT_MAX_TOKENS,
} from '../constants';
import { cleanSchemaForClaude, generateSessionId } from '../../common/utils';

export interface StreamAccumulator {
  reasoningContent: string;
  thoughtSignature: string;
  textContent: string;
  toolCalls: Map<number, ToolCallResponse>;
  toolIdx: number;
  hasToolCalls: boolean;
  isComplete: boolean;
  accumulatedFinishReason: string | null;
}

@Injectable()
export class TransformerService {
  transformRequest(
    dto: ChatCompletionRequestDto,
    projectId: string,
  ): AntigravityRequest {
    const { systemInstruction, contents } = this.transformMessages(
      dto.messages,
    );
    const internalModel = this.getInternalModel(
      dto.model,
      dto.reasoning_effort,
    );

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

  private getInternalModel(model: string, reasoningEffort?: string): string {
    if (model === 'gemini-3-pro-preview' || model.startsWith('gemini-3-pro')) {
      if (reasoningEffort === 'medium' || reasoningEffort === 'high') {
        return 'gemini-3-pro-high';
      }
      return 'gemini-3-pro-low';
    }

    if (model === 'claude-opus-4-5') {
      return 'claude-opus-4-5-thinking';
    }

    if (model === 'claude-sonnet-4-5') {
      return reasoningEffort
        ? 'claude-sonnet-4-5-thinking'
        : 'claude-sonnet-4-5';
    }

    if (model === 'gemini-2.5-flash') {
      return reasoningEffort ? 'gemini-2.5-flash-thinking' : 'gemini-2.5-flash';
    }

    return MODEL_ALIAS_MAP[model] || model;
  }

  private transformMessages(messages: MessageDto[]): {
    systemInstruction: { role: 'user'; parts: Array<{ text: string }> } | null;
    contents: AntigravityContent[];
  } {
    let systemInstruction: {
      role: 'user';
      parts: Array<{ text: string }>;
    } | null = null;
    const contents: AntigravityContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string' ? msg.content : '';
        systemInstruction = { role: 'user', parts: [{ text }] };
        continue;
      }

      if (msg.role === 'user') {
        contents.push(this.transformUserMessage(msg));
      } else if (msg.role === 'assistant') {
        contents.push(this.transformAssistantMessage(msg));
      } else if (msg.role === 'tool') {
        contents.push(this.transformToolResponse(msg));
      }
    }

    return { systemInstruction, contents };
  }

  private transformUserMessage(msg: MessageDto): AntigravityContent {
    const parts: AntigravityPart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const { mimeType, data } = this.parseImageUrl(part.image_url.url);
          parts.push({ inlineData: { mimeType, data } });
        }
      }
    }

    return { role: 'user', parts };
  }

  private parseImageUrl(url: string): { mimeType: string; data: string } {
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], data: match[2] };
      }
    }
    return { mimeType: 'image/png', data: url };
  }

  private transformAssistantMessage(msg: MessageDto): AntigravityContent {
    const parts: AntigravityPart[] = [];

    if (msg.content) {
      parts.push({ text: typeof msg.content === 'string' ? msg.content : '' });
    }

    if (msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}') as Record<
              string,
              unknown
            >,
            id: toolCall.id,
          },
        });
      }
    }

    return { role: 'model', parts };
  }

  private transformToolResponse(msg: MessageDto): AntigravityContent {
    const content = typeof msg.content === 'string' ? msg.content : '';
    let result: unknown;

    try {
      result = JSON.parse(content);
    } catch {
      result = { output: content };
    }

    return {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: msg.name || 'unknown_function',
            response: { result },
            id: msg.tool_call_id,
          },
        },
      ],
    };
  }

  private buildGenerationConfig(
    dto: ChatCompletionRequestDto,
  ): AntigravityGenerationConfig {
    const config: AntigravityGenerationConfig = {};
    const isClaude = dto.model.includes('claude');
    const isGemini3 = THINKING_LEVEL_MODELS.some((m) => dto.model.includes(m));

    if (dto.temperature !== undefined) config.temperature = dto.temperature;
    if (dto.top_p !== undefined) config.topP = dto.top_p;

    if (dto.max_tokens) {
      config.maxOutputTokens = dto.max_tokens;
    } else if (isClaude) {
      config.maxOutputTokens = DEFAULT_MAX_TOKENS[dto.model] || 64000;
    }

    if (dto.stop) config.stopSequences = dto.stop;

    if (isGemini3 && dto.reasoning_effort) {
      const level = dto.reasoning_effort === 'low' ? 'low' : 'high';
      config.thinkingConfig = {
        thinkingLevel: level,
        include_thoughts: true,
      };
    } else if (isClaude || dto.model.includes('gemini-2.5')) {
      const isOpus = dto.model === 'claude-opus-4-5';
      if (dto.reasoning_effort || isOpus) {
        const budget = dto.reasoning_effort
          ? THINKING_BUDGETS[dto.reasoning_effort]
          : -1;
        config.thinkingConfig = {
          thinkingBudget: budget,
          include_thoughts: true,
        };
      }
    }

    return config;
  }

  private transformTools(tools: ToolDto[], model: string): AntigravityTool[] {
    const isClaude = model.includes('claude');

    const functionDeclarations: AntigravityFunctionDeclaration[] = tools.map(
      (tool) => {
        const decl: AntigravityFunctionDeclaration = {
          name: tool.function.name,
          description: tool.function.description,
        };

        if (tool.function.parameters) {
          if (isClaude) {
            decl.parameters = cleanSchemaForClaude(tool.function.parameters);
          } else {
            decl.parametersJsonSchema = tool.function.parameters;
          }
        }

        return decl;
      },
    );

    return [{ functionDeclarations }];
  }

  private transformToolChoice(
    toolChoice?: ChatCompletionRequestDto['tool_choice'],
  ): AntigravityToolConfig {
    if (!toolChoice || toolChoice === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }
    if (toolChoice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }
    if (toolChoice === 'required') {
      return { functionCallingConfig: { mode: 'ANY' } };
    }
    if (typeof toolChoice === 'object' && toolChoice.function) {
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [toolChoice.function.name],
        },
      };
    }
    return { functionCallingConfig: { mode: 'AUTO' } };
  }

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

  private extractContent(parts: AntigravityResponsePart[]): {
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
}
