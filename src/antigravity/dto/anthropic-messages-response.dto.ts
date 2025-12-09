export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface AnthropicTextContent {
  type: 'text';
  text: string;
}

export interface AnthropicThinkingContent {
  type: 'thinking';
  thinking: string;
}

export interface AnthropicToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AnthropicResponseContent =
  | AnthropicTextContent
  | AnthropicThinkingContent
  | AnthropicToolUseContent;

export type AnthropicStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | null;

export interface AnthropicMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AnthropicResponseContent[];
  stop_reason: AnthropicStopReason;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

export interface AnthropicMessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: [];
    stop_reason: null;
    stop_sequence: null;
    usage: { input_tokens: number; output_tokens: number };
  };
}

export interface AnthropicContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block:
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string }
    | {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      };
}

export interface AnthropicPingEvent {
  type: 'ping';
}

export interface AnthropicContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'input_json_delta'; partial_json: string };
}

export interface AnthropicContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface AnthropicMessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: AnthropicStopReason;
    stop_sequence: string | null;
  };
  usage: { output_tokens: number };
}

export interface AnthropicMessageStopEvent {
  type: 'message_stop';
}

export interface AnthropicErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export type AnthropicStreamEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockStartEvent
  | AnthropicPingEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicContentBlockStopEvent
  | AnthropicMessageDeltaEvent
  | AnthropicMessageStopEvent
  | AnthropicErrorEvent;

export interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}
