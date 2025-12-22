import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnthropicTextBlock {
  @ApiProperty({ enum: ['text'] })
  @IsString()
  type: 'text';

  @ApiProperty()
  @IsString()
  text: string;
}

export class AnthropicImageSource {
  @ApiProperty({ enum: ['base64', 'url'] })
  @IsString()
  type: 'base64' | 'url';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  media_type?: string;

  @ApiProperty()
  @IsString()
  data: string;
}

export class AnthropicImageBlock {
  @ApiProperty({ enum: ['image'] })
  @IsString()
  type: 'image';

  @ApiProperty({ type: AnthropicImageSource })
  source: AnthropicImageSource;
}

export class AnthropicToolUseBlock {
  @ApiProperty({ enum: ['tool_use'] })
  @IsString()
  type: 'tool_use';

  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  input: Record<string, unknown>;
}

export class AnthropicToolResultBlock {
  @ApiProperty({ enum: ['tool_result'] })
  @IsString()
  type: 'tool_result';

  @ApiProperty()
  @IsString()
  tool_use_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  content?: string | AnthropicContentBlock[];

  @ApiPropertyOptional()
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
  @ApiProperty({ enum: ['object'] })
  @IsString()
  type: 'object';

  @ApiPropertyOptional()
  @IsOptional()
  properties?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  required?: string[];
}

export class AnthropicTool {
  @ApiProperty({ example: 'get_weather' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Get current weather' })
  @IsString()
  description: string;

  @ApiProperty({ type: AnthropicToolInputSchema })
  @ValidateNested()
  @Type(() => AnthropicToolInputSchema)
  input_schema: AnthropicToolInputSchema;
}

export class AnthropicThinkingConfig {
  @ApiProperty({ enum: ['enabled', 'disabled'] })
  @IsString()
  type: 'enabled' | 'disabled';

  @ApiPropertyOptional({ example: 8192 })
  @IsOptional()
  @IsNumber()
  budget_tokens?: number;
}

export class AnthropicMessagesRequestDto {
  @ApiProperty({ example: 'claude-sonnet-4-5' })
  @IsString()
  model: string;

  @ApiProperty({ type: 'array' })
  @IsArray()
  messages: AnthropicMessageParam[];

  @ApiProperty({ example: 1024 })
  @IsNumber()
  max_tokens: number;

  @ApiPropertyOptional({ example: 'You are a helpful assistant.' })
  @IsOptional()
  @IsString()
  system?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  top_p?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  top_k?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  stop_sequences?: string[];

  @ApiPropertyOptional({ type: [AnthropicTool] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnthropicTool)
  tools?: AnthropicTool[];

  @ApiPropertyOptional()
  @IsOptional()
  tool_choice?:
    | { type: 'auto' }
    | { type: 'any' }
    | { type: 'none' }
    | { type: 'tool'; name: string };

  @ApiPropertyOptional({ type: AnthropicThinkingConfig })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnthropicThinkingConfig)
  thinking?: AnthropicThinkingConfig;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: { user_id?: string };
}
