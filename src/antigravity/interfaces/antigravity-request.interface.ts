export interface AntigravityRequest {
  project: string;
  userAgent: string;
  requestId: string;
  model: string;
  request: {
    sessionId: string;
    contents: AntigravityContent[];
    systemInstruction?: AntigravitySystemInstruction;
    generationConfig?: AntigravityGenerationConfig;
    tools?: AntigravityTool[];
    toolConfig?: AntigravityToolConfig;
    safetySettings?: AntigravitySafetySetting[];
  };
}

export interface AntigravityContent {
  role: 'user' | 'model';
  parts: AntigravityPart[];
}

export interface AntigravityPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  functionResponse?: {
    name: string;
    response: {
      result: unknown;
    };
    id?: string;
  };
}

export interface AntigravitySystemInstruction {
  role: 'user';
  parts: Array<{ text: string }>;
}

export interface AntigravityGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  thinkingConfig?: {
    thinkingBudget?: number;
    thinkingLevel?: 'low' | 'high';
    include_thoughts?: boolean;
  };
}

export interface AntigravityTool {
  functionDeclarations: AntigravityFunctionDeclaration[];
}

export interface AntigravityFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  parametersJsonSchema?: Record<string, unknown>;
}

export interface AntigravityToolConfig {
  functionCallingConfig: {
    mode: 'AUTO' | 'NONE' | 'ANY';
    allowedFunctionNames?: string[];
  };
}

export interface AntigravitySafetySetting {
  category: string;
  threshold: string;
}
