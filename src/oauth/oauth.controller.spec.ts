import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

describe('OAuthController', () => {
  let controller: OAuthController;

  const mockOAuthService = {
    getAuthorizationUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/auth'),
    getRedirectUri: jest
      .fn()
      .mockReturnValue('http://localhost:3000/oauth/callback'),
    exchangeCodeForTokens: jest.fn(),
  };

  const mockRedirect = jest.fn();
  const mockResponse = {
    redirect: mockRedirect,
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        {
          provide: OAuthService,
          useValue: mockOAuthService,
        },
      ],
    }).compile();

    controller = module.get<OAuthController>(OAuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('authorize', () => {
    it('should redirect to auth URL', () => {
      controller.authorize(mockResponse);

      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/auth',
      );
    });
  });

  describe('getStatus', () => {
    it('should return object with authUrl and callbackUrl', () => {
      const result = controller.getStatus();

      expect(result).toEqual({
        authUrl: 'https://accounts.google.com/o/oauth2/auth',
        callbackUrl: 'http://localhost:3000/oauth/callback',
        instructions: 'Visit /oauth/authorize to start authentication',
      });
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalled();
      expect(mockOAuthService.getRedirectUri).toHaveBeenCalled();
    });
  });
});
