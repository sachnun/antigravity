import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChatCompletionRequestDto, MessageDto, ToolDto } from '../dto';
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
  DEFAULT_SAFETY_SETTINGS,
  USER_AGENT,
  MODEL_ALIAS_MAP,
  THINKING_LEVEL_MODELS,
  THINKING_BUDGETS,
  DEFAULT_MAX_TOKENS,
} from '../constants';
import { cleanSchemaForClaude, generateSessionId } from '../../common/utils';

/**
 * Service responsible for transforming OpenAI-compatible requests
 * into Antigravity API request format.
 */
@Injectable()
export class RequestTransformerService {
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

  /**
   * Maps external model names to internal Antigravity model identifiers.
   *
   * @param model - The external model name (e.g., 'claude-sonnet-4-5')
   * @param reasoningEffort - Optional reasoning effort level ('low', 'medium', 'high')
   * @returns Internal model identifier for the Antigravity API
   */
  getInternalModel(model: string, reasoningEffort?: string): string {
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

  /**
   * Transforms OpenAI message format to Antigravity content format.
   *
   * @param messages - Array of OpenAI-formatted messages
   * @returns Object containing system instruction and transformed contents
   */
  transformMessages(messages: MessageDto[]): {
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

  /**
   * Transforms a user message to Antigravity content format.
   * Supports both text and image content types.
   */
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

  /**
   * Parses an image URL, extracting MIME type and base64 data.
   * Supports data URLs and regular URLs.
   */
  private parseImageUrl(url: string): { mimeType: string; data: string } {
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        return { mimeType: match[1], data: match[2] };
      }
    }
    return { mimeType: 'image/png', data: url };
  }

  /**
   * Transforms an assistant message to Antigravity content format.
   * Handles both text content and tool calls.
   */
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

  /**
   * Transforms a tool response message to Antigravity content format.
   */
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

  /**
   * Builds the generation configuration for the Antigravity API.
   * Configures temperature, top_p, max tokens, stop sequences, and thinking settings.
   *
   * @param dto - The chat completion request DTO
   * @returns Generation configuration object
   */
  buildGenerationConfig(
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
      const defaultTokens = DEFAULT_MAX_TOKENS[dto.model];
      config.maxOutputTokens = defaultTokens ?? 64000;
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

  /**
   * Transforms OpenAI tool definitions to Antigravity format.
   *
   * @param tools - Array of OpenAI tool definitions
   * @param model - The model being used (affects schema format)
   * @returns Array of Antigravity tool definitions
   */
  transformTools(tools: ToolDto[], model: string): AntigravityTool[] {
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

  /**
   * Transforms OpenAI tool_choice to Antigravity tool configuration.
   *
   * @param toolChoice - OpenAI tool_choice value
   * @returns Antigravity tool configuration
   */
  transformToolChoice(
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
}
