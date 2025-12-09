import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AntigravityController } from './antigravity.controller';
import { AntigravityService } from './antigravity.service';
import { ChatCompletionRequestDto } from './dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

describe('AntigravityController', () => {
  let controller: AntigravityController;

  const mockAntigravityService = {
    chatCompletion: jest.fn(),
    chatCompletionStream: jest.fn(),
    listModels: jest.fn(),
  };

  const mockApiKeyGuard = {
    canActivate: jest.fn(() => true),
  };

  const createMockResponse = () => {
    const setHeader = jest.fn();
    return {
      response: { setHeader } as unknown as Response,
      setHeader,
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AntigravityController],
      providers: [
        {
          provide: AntigravityService,
          useValue: mockAntigravityService,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(mockApiKeyGuard)
      .compile();

    controller = module.get<AntigravityController>(AntigravityController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chatCompletions', () => {
    it('should call service.chatCompletion when stream is false', async () => {
      const dto: ChatCompletionRequestDto = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };
      const { response: mockResponse, setHeader } = createMockResponse();
      const expectedResult = { id: 'test-id', choices: [] };

      mockAntigravityService.chatCompletion.mockResolvedValue(expectedResult);

      const result = await controller.chatCompletions(dto, mockResponse);

      expect(mockAntigravityService.chatCompletion).toHaveBeenCalledWith(dto);
      expect(
        mockAntigravityService.chatCompletionStream,
      ).not.toHaveBeenCalled();
      expect(setHeader).toHaveBeenCalledWith(
        'x-request-id',
        expect.stringMatching(/^req_/),
      );
      expect(setHeader).toHaveBeenCalledWith(
        'openai-processing-ms',
        expect.any(String),
      );
      expect(result).toEqual(expectedResult);
    });

    it('should call service.chatCompletionStream when stream is true and set appropriate headers', async () => {
      const dto: ChatCompletionRequestDto = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };
      const { response: mockResponse, setHeader } = createMockResponse();

      mockAntigravityService.chatCompletionStream.mockResolvedValue(undefined);

      const result = await controller.chatCompletions(dto, mockResponse);

      expect(setHeader).toHaveBeenCalledWith(
        'x-request-id',
        expect.stringMatching(/^req_/),
      );
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockAntigravityService.chatCompletionStream).toHaveBeenCalledWith(
        dto,
        mockResponse,
      );
      expect(mockAntigravityService.chatCompletion).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('listModels', () => {
    it('should call service.listModels', () => {
      const expectedResult = { data: [{ id: 'model-1' }] };
      const { response: mockResponse, setHeader } = createMockResponse();

      mockAntigravityService.listModels.mockReturnValue(expectedResult);

      const result = controller.listModels(mockResponse);

      expect(mockAntigravityService.listModels).toHaveBeenCalled();
      expect(setHeader).toHaveBeenCalledWith(
        'x-request-id',
        expect.stringMatching(/^req_/),
      );
      expect(result).toEqual(expectedResult);
    });
  });
});
