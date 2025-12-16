import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AntigravityService } from './antigravity.service';
import { AccountsService } from '../accounts/accounts.service';
import { TransformerService } from './services/transformer.service';
import { AnthropicTransformerService } from './services/anthropic-transformer.service';
import { QuotaService } from '../quota/quota.service';
import { ChatCompletionRequestDto } from './dto';

describe('AntigravityService', () => {
  let service: AntigravityService;

  const mockAccountsService = {
    hasAccounts: jest.fn(),
    getAccountCount: jest.fn(),
    getNextAccount: jest.fn(),
    getProjectId: jest.fn(),
    getAuthHeaders: jest.fn(),
    markSuccess: jest.fn(),
    markCooldown: jest.fn(),
    getEarliestCooldownEnd: jest.fn(),
    refreshToken: jest.fn(),
    getAccountsForQuotaStatus: jest.fn().mockReturnValue([]),
    getReadyAccounts: jest.fn().mockReturnValue([]),
    getAccountById: jest.fn(),
    getAccessToken: jest.fn(),
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

  const mockQuotaService = {
    getQuotaStatus: jest
      .fn()
      .mockReturnValue({ totalAccounts: 0, accounts: [] }),
    fetchQuotaFromUpstream: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(3),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AntigravityService,
        {
          provide: AccountsService,
          useValue: mockAccountsService,
        },
        {
          provide: TransformerService,
          useValue: mockTransformerService,
        },
        {
          provide: AnthropicTransformerService,
          useValue: mockAnthropicTransformerService,
        },
        {
          provide: QuotaService,
          useValue: mockQuotaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
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

    it('should throw HttpException when no accounts configured', async () => {
      mockAccountsService.hasAccounts.mockReturnValue(false);

      await expect(service.chatCompletion(mockDto)).rejects.toThrow(
        HttpException,
      );
      await expect(service.chatCompletion(mockDto)).rejects.toThrow(
        'No accounts configured',
      );
    });

    it('should throw HttpException with SERVICE_UNAVAILABLE status when no accounts', async () => {
      mockAccountsService.hasAccounts.mockReturnValue(false);

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

    it('should call accountsService.hasAccounts()', async () => {
      mockAccountsService.hasAccounts.mockReturnValue(false);

      try {
        await service.chatCompletion(mockDto);
      } catch {
        // Expected to throw
      }

      expect(mockAccountsService.hasAccounts).toHaveBeenCalled();
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
