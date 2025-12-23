import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { AccountsService } from '../accounts';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface UserInfoResponse {
  email?: string;
}

export interface OAuthResult {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  email?: string;
  accountId: string;
  accountNumber: number;
  isNewAccount: boolean;
  totalAccounts: number;
}

@Injectable()
export class OAuthService implements OnModuleInit {
  private readonly logger = new Logger(OAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly TOKEN_URI = 'https://oauth2.googleapis.com/token';
  private readonly USER_INFO_URI =
    'https://www.googleapis.com/oauth2/v1/userinfo';
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ];
  private readonly REDIRECT_URI: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly accountsService: AccountsService,
  ) {
    this.clientId =
      this.configService.get<string>('antigravity.clientId') || '';
    this.clientSecret =
      this.configService.get<string>('antigravity.clientSecret') || '';
    const port = this.configService.get<number>('port') || 3000;
    this.REDIRECT_URI = `http://localhost:${port}/oauth/callback`;
  }

  onModuleInit() {
    this.validateCredentials();
  }

  private validateCredentials(): void {
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('='.repeat(60));
      this.logger.warn('OAUTH CREDENTIALS NOT CONFIGURED');
      this.logger.warn('='.repeat(60));
      this.logger.warn(
        'Set ANTIGRAVITY_CLIENT_ID and ANTIGRAVITY_CLIENT_SECRET',
      );
      this.logger.warn('in your environment variables to enable OAuth.');
      this.logger.warn('='.repeat(60));
    }
  }

  getRedirectUri(): string {
    return this.REDIRECT_URI;
  }

  getAuthorizationUrl(): string {
    if (!this.clientId) {
      throw new Error(
        'OAuth client ID not configured. Set ANTIGRAVITY_CLIENT_ID environment variable.',
      );
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.REDIRECT_URI,
      scope: this.SCOPES.join(' '),
      access_type: 'offline',
      response_type: 'code',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthResult> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        'OAuth credentials not configured. Set ANTIGRAVITY_CLIENT_ID and ANTIGRAVITY_CLIENT_SECRET environment variables.',
      );
    }

    this.logger.log('Exchanging authorization code for tokens...');

    const response: AxiosResponse<TokenResponse> = await axios.post(
      this.TOKEN_URI,
      new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiryDate = Date.now() + expires_in * 1000;

    let email = 'unknown';
    try {
      const userInfo: AxiosResponse<UserInfoResponse> = await axios.get(
        this.USER_INFO_URI,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );
      email = userInfo.data.email || 'unknown';
      this.logger.log(`Authenticated as: ${email}`);
    } catch {
      this.logger.warn('Could not fetch user email');
    }

    const { id, accountNumber, isNew } = this.accountsService.addAccount({
      email,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate,
    });

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate,
      email,
      accountId: id,
      accountNumber,
      isNewAccount: isNew,
      totalAccounts: this.accountsService.getAccountCount(),
    };
  }
}
