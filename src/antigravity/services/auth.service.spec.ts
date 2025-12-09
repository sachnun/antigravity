import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string | number> = {
        'antigravity.accessToken': 'test-access-token',
        'antigravity.refreshToken': 'test-refresh-token',
        'antigravity.expiryDate': Date.now() + 3600000,
        'antigravity.clientId': 'test-client-id',
        'antigravity.clientSecret': 'test-client-secret',
        'antigravity.projectId': 'test-project-id',
        'antigravity.email': 'test@example.com',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hasCredentials', () => {
    it('should return true when credentials are loaded', () => {
      service.onModuleInit();
      expect(service.hasCredentials()).toBe(true);
    });

    it('should return false when no refresh token', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'antigravity.refreshToken') return undefined;
        if (key === 'antigravity.accessToken') return 'test-access-token';
        return undefined;
      });

      const module = Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      })
        .compile()
        .then((m) => {
          const svc = m.get<AuthService>(AuthService);
          svc.onModuleInit();
          expect(svc.hasCredentials()).toBe(false);
        });

      return module;
    });
  });

  describe('isTokenExpired', () => {
    it('should return true when no credentials', () => {
      mockConfigService.get.mockImplementation(() => undefined);

      return Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      })
        .compile()
        .then((m) => {
          const svc = m.get<AuthService>(AuthService);
          svc.onModuleInit();
          expect(svc.isTokenExpired()).toBe(true);
        });
    });

    it('should return false when token not expired', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string | number> = {
          'antigravity.accessToken': 'test-access-token',
          'antigravity.refreshToken': 'test-refresh-token',
          'antigravity.expiryDate': Date.now() + 3600000,
          'antigravity.clientId': 'test-client-id',
          'antigravity.clientSecret': 'test-client-secret',
          'antigravity.projectId': 'test-project-id',
          'antigravity.email': 'test@example.com',
        };
        return config[key];
      });

      service.onModuleInit();
      expect(service.isTokenExpired()).toBe(false);
    });
  });

  describe('getAuthHeaders', () => {
    it('should return headers with Bearer token', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string | number> = {
          'antigravity.accessToken': 'test-access-token',
          'antigravity.refreshToken': 'test-refresh-token',
          'antigravity.expiryDate': Date.now() + 3600000,
          'antigravity.clientId': 'test-client-id',
          'antigravity.clientSecret': 'test-client-secret',
          'antigravity.projectId': 'test-project-id',
          'antigravity.email': 'test@example.com',
        };
        return config[key];
      });

      service.onModuleInit();
      const headers = await service.getAuthHeaders();

      expect(headers).toEqual({
        Authorization: 'Bearer test-access-token',
        'Content-Type': 'application/json',
      });
    });
  });
});
