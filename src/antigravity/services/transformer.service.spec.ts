import { Test, TestingModule } from '@nestjs/testing';
import { TransformerService } from './transformer.service';
import { ChatCompletionRequestDto } from '../dto';
import {
  AntigravityResponse,
  AntigravityStreamChunk,
} from '../interfaces/antigravity-response.interface';

describe('TransformerService', () => {
  let service: TransformerService;

  const mockDto: ChatCompletionRequestDto = {
    model: 'gemini-2.0-flash',
    messages: [{ role: 'user', content: 'Hello' }],
  };

  const mockResponse: AntigravityResponse = {
    response: {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hi there!' }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransformerService],
    }).compile();

    service = module.get<TransformerService>(TransformerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transformRequest', () => {
    it('should return request with proper structure', () => {
      const result = service.transformRequest(mockDto, 'test-project');

      expect(result).toHaveProperty('project', 'test-project');
      expect(result).toHaveProperty('userAgent');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('request.contents');
      expect(result.request.contents).toBeInstanceOf(Array);
      expect(result.request.contents.length).toBe(1);
      expect(result.request.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Hello' }],
      });
    });

    it('should handle system messages as systemInstruction', () => {
      const dtoWithSystem: ChatCompletionRequestDto = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      };

      const result = service.transformRequest(dtoWithSystem, 'test-project');

      expect(result.request.systemInstruction).toEqual({
        role: 'user',
        parts: [{ text: 'You are a helpful assistant' }],
      });
      expect(result.request.contents).toHaveLength(1);
      expect(result.request.contents[0].role).toBe('user');
    });
  });

  describe('transformResponse', () => {
    it('should return ChatCompletionResponse with proper structure', () => {
      const requestId = 'test-request-id';
      const model = 'gemini-2.0-flash';

      const result = service.transformResponse(mockResponse, model, requestId);

      expect(result).toHaveProperty('id', requestId);
      expect(result).toHaveProperty('object', 'chat.completion');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('model', model);
      expect(result).toHaveProperty('choices');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0]).toHaveProperty('index', 0);
      expect(result.choices[0]).toHaveProperty('message');
      expect(result.choices[0].message).toHaveProperty('role', 'assistant');
      expect(result.choices[0].message).toHaveProperty('content', 'Hi there!');
      expect(result.choices[0]).toHaveProperty('finish_reason', 'stop');
      expect(result).toHaveProperty('usage');
      expect(result.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });
  });

  describe('createStreamAccumulator', () => {
    it('should return accumulator with all required fields', () => {
      const accumulator = service.createStreamAccumulator();

      expect(accumulator).toHaveProperty('reasoningContent', '');
      expect(accumulator).toHaveProperty('thoughtSignature', '');
      expect(accumulator).toHaveProperty('textContent', '');
      expect(accumulator).toHaveProperty('toolCalls');
      expect(accumulator.toolCalls).toBeInstanceOf(Map);
      expect(accumulator).toHaveProperty('toolIdx', 0);
      expect(accumulator).toHaveProperty('hasToolCalls', false);
      expect(accumulator).toHaveProperty('isComplete', false);
      expect(accumulator).toHaveProperty('accumulatedFinishReason', null);
    });
  });

  describe('mapFinishReason', () => {
    it('should map STOP to stop', () => {
      const response: AntigravityResponse = {
        response: {
          candidates: [
            {
              content: { parts: [{ text: 'test' }] },
              finishReason: 'STOP',
            },
          ],
        },
      };

      const result = service.transformResponse(response, 'model', 'req-id');
      expect(result.choices[0].finish_reason).toBe('stop');
    });

    it('should map MAX_TOKENS to length', () => {
      const response: AntigravityResponse = {
        response: {
          candidates: [
            {
              content: { parts: [{ text: 'test' }] },
              finishReason: 'MAX_TOKENS',
            },
          ],
        },
      };

      const result = service.transformResponse(response, 'model', 'req-id');
      expect(result.choices[0].finish_reason).toBe('length');
    });

    it('should map SAFETY to content_filter', () => {
      const response: AntigravityResponse = {
        response: {
          candidates: [
            {
              content: { parts: [{ text: 'test' }] },
              finishReason: 'SAFETY',
            },
          ],
        },
      };

      const result = service.transformResponse(response, 'model', 'req-id');
      expect(result.choices[0].finish_reason).toBe('content_filter');
    });

    it('should map RECITATION to content_filter', () => {
      const response: AntigravityResponse = {
        response: {
          candidates: [
            {
              content: { parts: [{ text: 'test' }] },
              finishReason: 'RECITATION',
            },
          ],
        },
      };

      const result = service.transformResponse(response, 'model', 'req-id');
      expect(result.choices[0].finish_reason).toBe('content_filter');
    });

    it('should default to stop for unknown reasons', () => {
      const response: AntigravityResponse = {
        response: {
          candidates: [
            {
              content: { parts: [{ text: 'test' }] },
              finishReason: 'UNKNOWN',
            },
          ],
        },
      };

      const result = service.transformResponse(response, 'model', 'req-id');
      expect(result.choices[0].finish_reason).toBe('stop');
    });
  });

  describe('transformStreamChunk', () => {
    it('should return null for chunk without candidates', () => {
      const accumulator = service.createStreamAccumulator();
      const chunk: AntigravityStreamChunk = { response: {} };

      const result = service.transformStreamChunk(
        chunk,
        'model',
        'req-id',
        true,
        accumulator,
      );

      expect(result).toBeNull();
    });

    it('should include role in first chunk', () => {
      const accumulator = service.createStreamAccumulator();
      const chunk: AntigravityStreamChunk = {
        response: {
          candidates: [
            {
              content: { parts: [{ text: 'Hello' }] },
            },
          ],
        },
      };

      const result = service.transformStreamChunk(
        chunk,
        'model',
        'req-id',
        true,
        accumulator,
      );

      expect(result?.choices[0].delta.role).toBe('assistant');
    });
  });

  describe('createFinalChunk', () => {
    it('should create final chunk with stop finish_reason', () => {
      const accumulator = service.createStreamAccumulator();

      const result = service.createFinalChunk('req-id', 'model', accumulator);

      expect(result).toHaveProperty('id', 'req-id');
      expect(result).toHaveProperty('object', 'chat.completion.chunk');
      expect(result).toHaveProperty('model', 'model');
      expect(result.choices[0]).toHaveProperty('finish_reason', 'stop');
      expect(result.choices[0].delta).toEqual({});
    });

    it('should return tool_calls finish_reason when hasToolCalls is true', () => {
      const accumulator = service.createStreamAccumulator();
      accumulator.hasToolCalls = true;

      const result = service.createFinalChunk('req-id', 'model', accumulator);

      expect(result.choices[0].finish_reason).toBe('tool_calls');
    });
  });
});
