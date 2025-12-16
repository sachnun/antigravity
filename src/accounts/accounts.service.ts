import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AccountCredential,
  AccountState,
  AccountStatusResponse,
  AccountPublicInfo,
} from './interfaces';

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: { id: string };
  allowedTiers?: Array<{ id: string; isDefault?: boolean }>;
}

interface OnboardUserResponse {
  done?: boolean;
  response?: { cloudaicompanionProject?: { id: string } };
}

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly logger = new Logger(AccountsService.name);
  private accountStatesMap = new Map<string, AccountState>();
  private accountsList: AccountState[] = [];
  private emailToIdMap = new Map<string, string>();
  private currentIndex = 0;
  private readonly TOKEN_URI = 'https://oauth2.googleapis.com/token';
  private readonly CODE_ASSIST_ENDPOINT =
    'https://cloudcode-pa.googleapis.com/v1internal';
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;
  private readonly COOLDOWN_DURATION_MS: number;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.COOLDOWN_DURATION_MS =
      this.configService.get<number>('accounts.cooldownDurationMs') || 60000;
    this.clientId =
      this.configService.get<string>('antigravity.clientId') || '';
    this.clientSecret =
      this.configService.get<string>('antigravity.clientSecret') || '';
  }

  onModuleInit() {
    this.loadAccounts();
  }

  private loadAccounts(): void {
    const accounts =
      this.configService.get<AccountCredential[]>('accounts.list') || [];

    if (accounts.length === 0) {
      this.logger.warn(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
      );
      return;
    }

    accounts.forEach((credential, index) => {
      const id = `account-${index + 1}`;
      const state: AccountState = {
        id,
        credential,
        status: 'ready' as const,
        requestCount: 0,
        errorCount: 0,
      };
      this.accountStatesMap.set(id, state);
      this.accountsList.push(state);
      this.emailToIdMap.set(credential.email, id);
    });

    this.logger.log(
      `Loaded ${this.accountStatesMap.size} account(s) for rotation`,
    );
    this.accountsList.forEach((state) => {
      this.logger.log(`  - ${state.id}: ${state.credential.email}`);
    });
  }

  hasAccounts(): boolean {
    return this.accountStatesMap.size > 0;
  }

  getAccountCount(): number {
    return this.accountStatesMap.size;
  }

  getReadyAccounts(): AccountState[] {
    const now = Date.now();

    this.accountsList.forEach((state) => {
      if (
        state.status === 'cooldown' &&
        state.cooldownUntil &&
        state.cooldownUntil < now
      ) {
        state.status = 'ready';
        state.cooldownUntil = undefined;
        this.logger.debug(
          `Account ${state.id} cooldown expired, marking as ready`,
        );
      }
    });

    return this.accountsList.filter((s) => s.status === 'ready');
  }

  getNextAccount(): AccountState | null {
    const readyAccounts = this.getReadyAccounts();

    if (readyAccounts.length === 0) {
      return null;
    }

    this.currentIndex = this.currentIndex % readyAccounts.length;
    const selected = readyAccounts[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % readyAccounts.length;

    return selected;
  }

  getAccountById(accountId: string): AccountState | undefined {
    return this.accountStatesMap.get(accountId);
  }

  getAllAccountIds(): string[] {
    return Array.from(this.accountStatesMap.keys());
  }

  getAccountsForQuotaStatus(): Array<{ id: string; email: string }> {
    return this.accountsList.map((state) => ({
      id: state.id,
      email: this.maskEmail(state.credential.email),
    }));
  }

  markCooldown(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.status = 'cooldown';
      state.cooldownUntil = Date.now() + this.COOLDOWN_DURATION_MS;
      state.errorCount++;
      this.logger.warn(
        `Account ${accountId} (${state.credential.email}) marked as cooldown until ${new Date(state.cooldownUntil).toISOString()}`,
      );
    }
  }

  markError(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.status = 'error';
      state.errorCount++;
      this.logger.error(
        `Account ${accountId} (${state.credential.email}) marked as error`,
      );
    }
  }

  markSuccess(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.requestCount++;
      state.lastUsed = Date.now();
      if (state.status === 'error') {
        state.status = 'ready';
      }
    }
  }

  addAccount(credential: AccountCredential): {
    id: string;
    accountNumber: number;
    isNew: boolean;
  } {
    const existingId = this.emailToIdMap.get(credential.email);

    if (existingId) {
      const existing = this.accountStatesMap.get(existingId)!;
      existing.credential.accessToken = credential.accessToken;
      existing.credential.refreshToken = credential.refreshToken;
      existing.credential.expiryDate = credential.expiryDate;
      existing.status = 'ready';
      existing.errorCount = 0;
      this.logger.log(
        `Updated existing account ${existing.id}: ${credential.email}`,
      );
      const accountNumber =
        this.accountsList.findIndex((s) => s.id === existingId) + 1;
      return {
        id: existing.id,
        accountNumber,
        isNew: false,
      };
    }

    const accountNumber = this.accountStatesMap.size + 1;
    const id = `account-${accountNumber}`;
    const newState: AccountState = {
      id,
      credential,
      status: 'ready',
      requestCount: 0,
      errorCount: 0,
    };

    this.accountStatesMap.set(id, newState);
    this.accountsList.push(newState);
    this.emailToIdMap.set(credential.email, id);
    this.logger.log(`Added new account ${id}: ${credential.email}`);
    return { id, accountNumber, isNew: true };
  }

  getStatus(): AccountStatusResponse {
    const accounts: AccountPublicInfo[] = this.accountsList.map((state) => ({
      id: state.id,
      email: this.maskEmail(state.credential.email),
      status: state.status,
      cooldownUntil: state.cooldownUntil,
      lastUsed: state.lastUsed,
      requestCount: state.requestCount,
      errorCount: state.errorCount,
    }));

    return {
      totalAccounts: this.accountStatesMap.size,
      readyAccounts: this.accountsList.filter((s) => s.status === 'ready')
        .length,
      cooldownAccounts: this.accountsList.filter((s) => s.status === 'cooldown')
        .length,
      errorAccounts: this.accountsList.filter((s) => s.status === 'error')
        .length,
      currentIndex: this.currentIndex,
      accounts,
    };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const maskedLocal =
      local.length <= 2
        ? '*'.repeat(local.length)
        : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    const [domainName, tld] = domain.split('.');
    const maskedDomain =
      domainName.length <= 2
        ? '*'.repeat(domainName.length)
        : domainName[0] +
          '*'.repeat(domainName.length - 2) +
          domainName[domainName.length - 1];
    return `${maskedLocal}@${maskedDomain}.${tld}`;
  }

  getEarliestCooldownEnd(): number | null {
    const cooldownAccounts = this.accountsList.filter(
      (s) => s.status === 'cooldown' && s.cooldownUntil,
    );
    if (cooldownAccounts.length === 0) return null;

    return Math.min(...cooldownAccounts.map((s) => s.cooldownUntil!));
  }

  isTokenExpired(state: AccountState): boolean {
    return Date.now() + this.REFRESH_BUFFER_MS >= state.credential.expiryDate;
  }

  async getAccessToken(state: AccountState): Promise<string> {
    if (this.isTokenExpired(state)) {
      await this.refreshToken(state);
    }
    return state.credential.accessToken;
  }

  async refreshToken(state: AccountState): Promise<void> {
    this.logger.debug(
      `Refreshing token for account ${state.id} (${state.credential.email})...`,
    );

    try {
      const response = await axios.post<OAuthTokenResponse>(
        this.TOKEN_URI,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: state.credential.refreshToken,
          grant_type: 'refresh_token',
        },
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          transformRequest: [
            (data: Record<string, string>) =>
              new URLSearchParams(data).toString(),
          ],
        },
      );

      state.credential.accessToken = response.data.access_token;
      state.credential.expiryDate =
        Date.now() + response.data.expires_in * 1000;

      if (response.data.refresh_token) {
        state.credential.refreshToken = response.data.refresh_token;
      }

      this.logger.debug(`Successfully refreshed token for account ${state.id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to refresh token for account ${state.id}: ${errorMessage}`,
      );
      this.markError(state.id);
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  async getAuthHeaders(state: AccountState): Promise<Record<string, string>> {
    const token = await this.getAccessToken(state);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getProjectId(state: AccountState): Promise<string> {
    if (state.credential.projectId) {
      return state.credential.projectId;
    }

    if (state.discoveredProjectId) {
      return state.discoveredProjectId;
    }

    state.discoveredProjectId = await this.discoverProjectId(state);
    return state.discoveredProjectId;
  }

  private async discoverProjectId(state: AccountState): Promise<string> {
    this.logger.debug(`Discovering project ID for account ${state.id}...`);

    const token = await this.getAccessToken(state);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const coreClientMetadata = {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
    };

    try {
      const loadResponse = await axios.post<LoadCodeAssistResponse>(
        `${this.CODE_ASSIST_ENDPOINT}:loadCodeAssist`,
        { cloudaicompanionProject: null, metadata: coreClientMetadata },
        { headers, timeout: 20000 },
      );

      const data = loadResponse.data;
      const serverProject = data.cloudaicompanionProject;

      if (serverProject) {
        this.logger.log(
          `Discovered project ID for ${state.id}: ${serverProject}`,
        );
        return serverProject;
      }

      if (!data.currentTier) {
        this.logger.log(`Onboarding account ${state.id}...`);
        const allowedTiers = data.allowedTiers || [];
        const defaultTier = allowedTiers.find((t) => t.isDefault);
        const tierId = defaultTier?.id || 'free-tier';

        const projectId = await this.onboardUser(tierId, headers);
        if (projectId) {
          this.logger.log(
            `Onboarded ${state.id} with project ID: ${projectId}`,
          );
          return projectId;
        }
      }

      return this.generateFakeProjectId();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Project discovery failed for ${state.id}: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
        );
      } else {
        this.logger.error(`Project discovery failed for ${state.id}: ${error}`);
      }
      return this.generateFakeProjectId();
    }
  }

  private async onboardUser(
    tierId: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    const coreClientMetadata = {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
    };

    for (let i = 0; i < 60; i++) {
      const response = await axios.post<OnboardUserResponse>(
        `${this.CODE_ASSIST_ENDPOINT}:onboardUser`,
        { tierId, cloudaicompanionProject: null, metadata: coreClientMetadata },
        { headers, timeout: 30000 },
      );

      if (response.data.done) {
        return response.data.response?.cloudaicompanionProject?.id || null;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  }

  private generateFakeProjectId(): string {
    const adjectives = ['useful', 'bright', 'swift', 'calm', 'bold'];
    const nouns = ['fuze', 'wave', 'spark', 'flow', 'core'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomHex = Math.random().toString(16).substring(2, 7);
    return `${randomAdj}-${randomNoun}-${randomHex}`;
  }
}
