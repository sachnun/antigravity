export const AVAILABLE_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
] as const;

export type AvailableModel = (typeof AVAILABLE_MODELS)[number];

export const THINKING_ONLY_MODELS = ['claude-opus-4-5'] as const;

export const MODEL_ALIAS_MAP: Record<string, string> = {};

export const THINKING_LEVEL_MODELS = ['gemini-3-pro-preview', 'gemini-3-flash'];

export const THINKING_BUDGETS: Record<string, number> = {
  low: 8192,
  medium: 16384,
  high: 32768,
};

export const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'claude-opus-4-5': 64000,
  'claude-sonnet-4-5': 64000,
  'gemini-3-pro-preview': 65536,
  'gemini-3-flash': 65536,
};

export const MODEL_OWNERS: Record<string, string> = {
  'gemini-3-pro-preview': 'google',
  'gemini-3-flash': 'google',
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
};
