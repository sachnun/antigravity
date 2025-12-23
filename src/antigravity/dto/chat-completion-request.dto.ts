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

export class ContentPart {
  @ApiProperty({ enum: ['text', 'image_url'] })
  @IsString()
  type!: 'text' | 'image_url';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  image_url?: { url: string; detail?: string };
}

export class ToolCall {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['function'] })
  @IsString()
  type!: 'function';

  @ApiProperty()
  function!: {
    name: string;
    arguments: string;
  };
}

export class MessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant', 'tool'] })
  @IsString()
  role!: 'system' | 'user' | 'assistant' | 'tool';

  @ApiPropertyOptional({ oneOf: [{ type: 'string' }, { type: 'array' }] })
  @IsOptional()
  content?: string | ContentPart[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [ToolCall] })
  @IsOptional()
  @IsArray()
  tool_calls?: ToolCall[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tool_call_id?: string;
}

export class ToolDto {
  @ApiProperty({ enum: ['function'] })
  @IsString()
  type!: 'function';

  @ApiProperty()
  function!: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
}

export class ChatCompletionRequestDto {
  @ApiProperty({
    example: 'claude-sonnet-4-5',
    description: 'The model to use for completion',
  })
  @IsString()
  model!: string;

  @ApiProperty({ type: [MessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages!: MessageDto[];

  @ApiPropertyOptional({ minimum: 0, maximum: 2, example: 1 })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  top_p?: number;

  @ApiPropertyOptional({ example: 4096 })
  @IsOptional()
  @IsNumber()
  max_tokens?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  stop?: string[];

  @ApiPropertyOptional({ type: [ToolDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolDto)
  tools?: ToolDto[];

  @ApiPropertyOptional({ oneOf: [{ type: 'string' }] })
  @IsOptional()
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  user?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsString()
  reasoning_effort?: 'low' | 'medium' | 'high';
}
