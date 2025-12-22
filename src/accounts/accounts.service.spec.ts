import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AccountsService } from './accounts.service';
import { QuotaService } from '../quota/quota.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let quotaService: QuotaService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'accounts.list') {
        return [
          {
            email: 'acc1@gmail.com',
            accessToken: 't1',
            refreshToken: 'r1',
            expiryDate: Date.now() + 3600000,
          },
          {
            email: 'acc2@gmail.com',
            accessToken: 't2',
            refreshToken: 'r2',
            expiryDate: Date.now() + 3600000,
          },
        ];
      }
      if (key === 'accounts.cooldownDurationMs') return 1000;
      if (key === 'antigravity.clientId') return 'client-id';
      if (key === 'antigravity.clientSecret') return 'client-secret';
      return null;
    }),
  };

  const mockQuotaService = {
    getQuotaStatus: jest.fn(() => ({
      accounts: [
        {
          models: [
            { modelName: 'gemini-3-flash', quota: 1.0, status: 'available' },
          ],
        },
        {
          models: [
            { modelName: 'gemini-3-flash', quota: 0.1, status: 'exhausted' },
          ],
        },
      ],
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: QuotaService, useValue: mockQuotaService },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
    quotaService = module.get<QuotaService>(QuotaService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Circuit Breaker (Exponential Backoff)', () => {
    it('should increase cooldown time exponentially', () => {
      const accountId = 'account-1';

      // First error
      service.markCooldown(accountId);
      let state = service.getAccountById(accountId);
      expect(state).toBeDefined();
      const firstCooldown = state!.cooldownUntil! - Date.now();
      expect(state!.consecutiveErrors).toBe(1);
      expect(firstCooldown).toBeGreaterThan(0);

      // Second error
      service.markCooldown(accountId);
      state = service.getAccountById(accountId);
      expect(state).toBeDefined();
      const secondCooldown = state!.cooldownUntil! - Date.now();
      expect(state!.consecutiveErrors).toBe(2);
      // Backoff should be 2x
      expect(secondCooldown).toBeGreaterThan(firstCooldown);
    });

    it('should reset consecutive errors on success', () => {
      const accountId = 'account-1';
      service.markCooldown(accountId);
      service.markCooldown(accountId);

      service.markSuccess(accountId);
      const state = service.getAccountById(accountId);
      expect(state).toBeDefined();
      expect(state!.consecutiveErrors).toBe(0);
      expect(state!.status).toBe('ready');
    });
  });

  describe('Least Used / Quota-Aware Rotation', () => {
    it('should prefer account with more quota', () => {
      const selected = service.getNextAccount('gemini-3-flash');
      // acc1 has 1.0 quota, acc2 has 0.1
      expect(selected?.credential.email).toBe('acc1@gmail.com');
    });

    it('should prefer least used account when quotas are equal', () => {
      // Mock equal quotas
      mockQuotaService.getQuotaStatus.mockReturnValue({
        accounts: [
          {
            models: [{ modelName: 'model-x', quota: 1.0, status: 'available' }],
          },
          {
            models: [{ modelName: 'model-x', quota: 1.0, status: 'available' }],
          },
        ],
      } as any);

      const account1 = service.getAccountById('account-1')!;
      account1.requestCount = 10;

      const account2 = service.getAccountById('account-2')!;
      account2.requestCount = 2;

      const selected = service.getNextAccount('model-x');
      expect(selected?.id).toBe('account-2');
    });
  });
});
