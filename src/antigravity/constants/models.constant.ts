export const AVAILABLE_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-pro-high',
  'gemini-3-pro-low',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'gpt-oss-120b-medium',
] as const;

export type AvailableModel = (typeof AVAILABLE_MODELS)[number];

export const THINKING_ONLY_MODELS = ['claude-opus-4-5'] as const;

export const MODEL_ALIAS_MAP: Record<string, string> = {};

export const THINKING_LEVEL_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash',
  'gemini-2.5-flash',
];

export const THINKING_BUDGETS: Record<string, number> = {
  low: 8192,
  medium: 16384,
  high: 32768,
};

export const DEFAULT_MAX_TOKENS: Record<string, number> = {
  'claude-opus-4-5': 64000,
  'claude-sonnet-4-5': 64000,
  'gemini-3-pro-preview': 65536,
  'gemini-3-pro-high': 65536,
  'gemini-3-pro-low': 65536,
  'gemini-3-flash': 65536,
  'gemini-2.5-flash': 65536,
  'gemini-2.5-flash-lite': 65536,
  'gpt-oss-120b-medium': 32768,
};

export const MODEL_OWNERS: Record<string, string> = {
  'gemini-3-pro-preview': 'google',
  'gemini-3-pro-high': 'google',
  'gemini-3-pro-low': 'google',
  'gemini-3-flash': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.5-flash-lite': 'google',
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'gpt-oss-120b-medium': 'openai',
};

export const QUOTA_GROUPS: Record<string, string[]> = {
  claude: ['claude-sonnet-4-5', 'claude-opus-4-5', 'gpt-oss-120b-medium'],
  'gemini-3-pro': [
    'gemini-3-pro-preview',
    'gemini-3-pro-high',
    'gemini-3-pro-low',
  ],
  'gemini-3-flash': ['gemini-3-flash'],
  'gemini-2.5-flash': ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
};

export const GROUP_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude / GPT-OSS',
  'gemini-3-pro': 'Gemini 3 Pro',
  'gemini-3-flash': 'Gemini 3 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
};

export const MODEL_TO_GROUP: Record<string, string> = Object.entries(
  QUOTA_GROUPS,
).reduce(
  (acc, [group, models]) => {
    for (const model of models) {
      acc[model] = group;
    }
    return acc;
  },
  {} as Record<string, string>,
);
