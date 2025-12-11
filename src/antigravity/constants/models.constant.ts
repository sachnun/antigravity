export const AVAILABLE_MODELS = [
  'gemini-3-pro-preview',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-thinking',
  'claude-opus-4-5',
] as const;

export type AvailableModel = (typeof AVAILABLE_MODELS)[number];

export const THINKING_ONLY_MODELS = ['claude-opus-4-5'] as const;

export const MODEL_ALIAS_MAP: Record<string, string> = {
  'gemini-3-pro-low': 'gemini-3-pro-preview',
  'gemini-3-pro-high': 'gemini-3-pro-preview',
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
};

export const THINKING_LEVEL_MODELS = ['gemini-3-pro-preview'];

export const THINKING_BUDGETS: Record<string, number> = {
  low: 8192,
  medium: 16384,
  high: 32768,
};

export const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'claude-opus-4-5': 64000,
  'claude-sonnet-4-5': 64000,
  'claude-sonnet-4-5-thinking': 64000,
  'gemini-3-pro-preview': 65536,
};

export const MODEL_OWNERS: Record<string, string> = {
  'gemini-3-pro-preview': 'google',
  'claude-sonnet-4-5': 'anthropic',
  'claude-sonnet-4-5-thinking': 'anthropic',
  'claude-opus-4-5': 'anthropic',
};
