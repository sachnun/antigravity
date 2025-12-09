import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AntigravityService } from './antigravity.service';
import { AuthService } from './services/auth.service';
import { TransformerService } from './services/transformer.service';
import { AnthropicTransformerService } from './services/anthropic-transformer.service';
import { ChatCompletionRequestDto } from './dto';

describe('AntigravityService', () => {
  let service: AntigravityService;

  const mockAuthService = {
    hasCredentials: jest.fn(),
    getProjectId: jest.fn(),
    getAuthHeaders: jest.fn(),
    refreshToken: jest.fn(),
  };

  const mockTransformerService = {
    transformRequest: jest.fn(),
    transformResponse: jest.fn(),
    createStreamAccumulator: jest.fn(),
    transformStreamChunk: jest.fn(),
    createFinalChunk: jest.fn(),
  };

  const mockAnthropicTransformerService = {
    transformRequest: jest.fn(),
    transformResponse: jest.fn(),
    createStreamAccumulator: jest.fn(),
    transformStreamChunk: jest.fn(),
    createFinalEvents: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AntigravityService,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: TransformerService,
          useValue: mockTransformerService,
        },
        {
          provide: AnthropicTransformerService,
          useValue: mockAnthropicTransformerService,
        },
      ],
    }).compile();

    service = module.get<AntigravityService>(AntigravityService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chatCompletion', () => {
    const mockDto: ChatCompletionRequestDto = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    it('should throw HttpException when credentials not configured', async () => {
      mockAuthService.hasCredentials.mockReturnValue(false);

      await expect(service.chatCompletion(mockDto)).rejects.toThrow(
        HttpException,
      );
      await expect(service.chatCompletion(mockDto)).rejects.toThrow(
        'Antigravity credentials not configured',
      );
    });

    it('should throw HttpException with SERVICE_UNAVAILABLE status when credentials not configured', async () => {
      mockAuthService.hasCredentials.mockReturnValue(false);

      try {
        await service.chatCompletion(mockDto);
        fail('Expected HttpException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    });

    it('should call authService.hasCredentials()', async () => {
      mockAuthService.hasCredentials.mockReturnValue(false);

      try {
        await service.chatCompletion(mockDto);
      } catch {
        // Expected to throw
      }

      expect(mockAuthService.hasCredentials).toHaveBeenCalled();
    });
  });

  describe('listModels', () => {
    it('should return object with list type and data array', () => {
      const result = service.listModels();

      expect(result).toHaveProperty('object', 'list');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return models with correct structure', () => {
      const result = service.listModels();

      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('object', 'model');
        expect(model).toHaveProperty('created');
        expect(model).toHaveProperty('owned_by');
      });
    });
  });
});
