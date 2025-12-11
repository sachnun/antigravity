export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  system_fingerprint: string | null;
  choices: ChatCompletionChoice[];
  usage?: UsageInfo;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: ToolCallResponse[];
    refusal?: string | null;
    reasoning_content?: string;
  };
  logprobs: null;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ToolCallResponse {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
    audio_tokens?: number;
  };
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint: string | null;
  choices: ChatCompletionChunkChoice[];
  usage?: UsageInfo;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: ToolCallDelta[];
    refusal?: string | null;
    reasoning_content?: string;
  };
  logprobs: null;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}
