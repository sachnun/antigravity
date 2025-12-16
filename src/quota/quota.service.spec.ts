import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuotaService } from './quota.service';
import { AccountState } from '../accounts/interfaces';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('QuotaService', () => {
  let service: QuotaService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue(0.01),
  };

  const createMockAccountState = (id: string, email: string): AccountState => ({
    id,
    credential: {
      email,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiryDate: Date.now() + 3600000,
    },
    status: 'ready',
    requestCount: 0,
    errorCount: 0,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchQuotaFromUpstream', () => {
    const mockAccountState = createMockAccountState(
      'account-1',
      'test@example.com',
    );

    it('should fetch and cache quota from upstream', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          models: {
            'gemini-2.5-pro': {
              quotaInfo: {
                remainingFraction: 0.85,
                resetTime: '2025-12-17T00:00:00Z',
              },
            },
            'gemini-2.0-flash': {
              quotaInfo: {
                remainingFraction: 1.0,
              },
            },
          },
        },
      });

      await service.fetchQuotaFromUpstream(
        mockAccountState,
        'access-token',
        'project-id',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      const status = service.getQuotaStatus([
        { id: 'account-1', email: 'test@example.com' },
      ]);

      expect(status.totalAccounts).toBe(1);
      expect(status.accounts[0].models).toHaveLength(2);

      const proModel = status.accounts[0].models.find(
        (m) => m.modelName === 'gemini-2.5-pro',
      );
      expect(proModel?.quota).toBe(0.85);
      expect(proModel?.status).toBe('available');
    });

    it('should try next URL on failure', async () => {
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: {
            models: {
              'gemini-2.0-flash': {
                quotaInfo: { remainingFraction: 0.5 },
              },
            },
          },
        });

      await service.fetchQuotaFromUpstream(
        mockAccountState,
        'access-token',
        'project-id',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      const status = service.getQuotaStatus([
        { id: 'account-1', email: 'test@example.com' },
      ]);
      expect(status.accounts[0].models).toHaveLength(1);
    });

    it('should handle all URLs failing gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await service.fetchQuotaFromUpstream(
        mockAccountState,
        'access-token',
        'project-id',
      );

      const status = service.getQuotaStatus([
        { id: 'account-1', email: 'test@example.com' },
      ]);
      expect(status.accounts[0].models).toHaveLength(0);
    });
  });

  describe('getQuotaStatus', () => {
    it('should return empty models for accounts without cache', () => {
      const status = service.getQuotaStatus([
        { id: 'unknown-account', email: 'unknown@example.com' },
      ]);

      expect(status.totalAccounts).toBe(1);
      expect(status.accounts[0].accountId).toBe('unknown-account');
      expect(status.accounts[0].models).toHaveLength(0);
      expect(status.accounts[0].lastFetchedAt).toBeUndefined();
    });

    it('should return correct status based on quota threshold', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          models: {
            'model-available': {
              quotaInfo: { remainingFraction: 0.5 },
            },
            'model-exhausted': {
              quotaInfo: { remainingFraction: 0.005 },
            },
          },
        },
      });

      await service.fetchQuotaFromUpstream(
        createMockAccountState('account-1', 'test@example.com'),
        'access-token',
      );

      const status = service.getQuotaStatus([
        { id: 'account-1', email: 'test@example.com' },
      ]);

      const available = status.accounts[0].models.find(
        (m) => m.modelName === 'model-available',
      );
      const exhausted = status.accounts[0].models.find(
        (m) => m.modelName === 'model-exhausted',
      );

      expect(available?.status).toBe('available');
      expect(exhausted?.status).toBe('exhausted');
    });

    it('should sort models alphabetically', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          models: {
            'z-model': { quotaInfo: { remainingFraction: 1.0 } },
            'a-model': { quotaInfo: { remainingFraction: 1.0 } },
            'm-model': { quotaInfo: { remainingFraction: 1.0 } },
          },
        },
      });

      await service.fetchQuotaFromUpstream(
        createMockAccountState('account-1', 'test@example.com'),
        'access-token',
      );

      const status = service.getQuotaStatus([
        { id: 'account-1', email: 'test@example.com' },
      ]);

      expect(status.accounts[0].models.map((m) => m.modelName)).toEqual([
        'a-model',
        'm-model',
        'z-model',
      ]);
    });

    it('should handle multiple accounts', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          models: {
            'gemini-2.0-flash': { quotaInfo: { remainingFraction: 0.75 } },
          },
        },
      });

      await service.fetchQuotaFromUpstream(
        createMockAccountState('account-1', 'user1@example.com'),
        'access-token',
      );

      await service.fetchQuotaFromUpstream(
        createMockAccountState('account-2', 'user2@example.com'),
        'access-token',
      );

      const status = service.getQuotaStatus([
        { id: 'account-1', email: 'user1@example.com' },
        { id: 'account-2', email: 'user2@example.com' },
      ]);

      expect(status.totalAccounts).toBe(2);
      expect(status.accounts).toHaveLength(2);
      expect(status.accounts[0].models).toHaveLength(1);
      expect(status.accounts[1].models).toHaveLength(1);
    });
  });
});
