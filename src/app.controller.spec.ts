import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountsService } from './accounts/accounts.service';
import { AntigravityService } from './antigravity/antigravity.service';
import { QuotaService } from './quota/quota.service';

describe('AppController', () => {
  let appController: AppController;

  const mockAccountsService = {
    getStatus: jest.fn().mockReturnValue({ totalAccounts: 0, accounts: [] }),
    getAccountsForQuotaStatus: jest.fn().mockReturnValue([]),
  };

  const mockAntigravityService = {
    getQuotaStatus: jest
      .fn()
      .mockResolvedValue({ totalAccounts: 0, accounts: [] }),
  };

  const mockQuotaService = {
    getQuotaStatus: jest
      .fn()
      .mockReturnValue({ totalAccounts: 0, accounts: [] }),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(''),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: AntigravityService, useValue: mockAntigravityService },
        { provide: QuotaService, useValue: mockQuotaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return health check response', () => {
      const result = appController.getHealth();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });
});
