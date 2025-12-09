import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AnthropicTextBlock {
  @IsString()
  type: 'text';

  @IsString()
  text: string;
}

export class AnthropicImageSource {
  @IsString()
  type: 'base64' | 'url';

  @IsOptional()
  @IsString()
  media_type?: string;

  @IsString()
  data: string;
}

export class AnthropicImageBlock {
  @IsString()
  type: 'image';

  source: AnthropicImageSource;
}

export class AnthropicToolUseBlock {
  @IsString()
  type: 'tool_use';

  @IsString()
  id: string;

  @IsString()
  name: string;

  input: Record<string, unknown>;
}

export class AnthropicToolResultBlock {
  @IsString()
  type: 'tool_result';

  @IsString()
  tool_use_id: string;

  @IsOptional()
  content?: string | AnthropicContentBlock[];

  @IsOptional()
  @IsBoolean()
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export class AnthropicToolInputSchema {
  @IsString()
  type: 'object';

  @IsOptional()
  properties?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  required?: string[];
}

export class AnthropicTool {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @ValidateNested()
  @Type(() => AnthropicToolInputSchema)
  input_schema: AnthropicToolInputSchema;
}

export class AnthropicThinkingConfig {
  @IsString()
  type: 'enabled' | 'disabled';

  @IsOptional()
  @IsNumber()
  budget_tokens?: number;
}

export class AnthropicMessagesRequestDto {
  @IsString()
  model: string;

  @IsArray()
  messages: AnthropicMessageParam[];

  @IsNumber()
  max_tokens: number;

  @IsOptional()
  @IsString()
  system?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  top_p?: number;

  @IsOptional()
  @IsNumber()
  top_k?: number;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @IsOptional()
  @IsArray()
  stop_sequences?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnthropicTool)
  tools?: AnthropicTool[];

  @IsOptional()
  tool_choice?:
    | { type: 'auto' }
    | { type: 'any' }
    | { type: 'none' }
    | { type: 'tool'; name: string };

  @IsOptional()
  @ValidateNested()
  @Type(() => AnthropicThinkingConfig)
  thinking?: AnthropicThinkingConfig;

  @IsOptional()
  metadata?: { user_id?: string };
}
