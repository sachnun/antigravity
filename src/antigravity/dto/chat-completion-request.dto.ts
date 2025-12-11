import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageDto {
  @IsString()
  role: 'system' | 'user' | 'assistant' | 'tool';

  @IsOptional()
  content?: string | ContentPart[];

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  tool_calls?: ToolCall[];

  @IsOptional()
  @IsString()
  tool_call_id?: string;
}

export class ContentPart {
  @IsString()
  type: 'text' | 'image_url';

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  image_url?: { url: string; detail?: string };
}

export class ToolCall {
  @IsString()
  id: string;

  @IsString()
  type: 'function';

  function: {
    name: string;
    arguments: string;
  };
}

export class ToolDto {
  @IsString()
  type: 'function';

  function: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
}

export class ChatCompletionRequestDto {
  @IsString()
  model: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages: MessageDto[];

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  top_p?: number;

  @IsOptional()
  @IsNumber()
  max_tokens?: number;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @IsOptional()
  @IsArray()
  stop?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolDto)
  tools?: ToolDto[];

  @IsOptional()
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } };

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  reasoning_effort?: 'low' | 'medium' | 'high';
}
