import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QuotaService } from '../quota/quota.service';
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

  constructor(
    private readonly configService: ConfigService,
    private readonly quotaService: QuotaService,
  ) {
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
        consecutiveErrors: 0,
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

  /**
   * Checks if any accounts are configured and available.
   *
   * @returns True if at least one account is configured
   */
  hasAccounts(): boolean {
    return this.accountStatesMap.size > 0;
  }

  /**
   * Gets the total number of configured accounts.
   *
   * @returns The count of all configured accounts
   */
  getAccountCount(): number {
    return this.accountStatesMap.size;
  }

  /**
   * Gets all accounts that are ready to accept requests.
   * Also expires cooldowns for accounts whose cooldown period has ended.
   *
   * @returns Array of account states that are ready for use
   */
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

  /**
   * Selects the next best account for a request using a scoring system.
   * Considers quota availability, request count, and recency of use.
   *
   * @param modelName - Optional model name to consider for quota-based selection
   * @returns The best available account or null if none are ready
   */
  getNextAccount(modelName?: string): AccountState | null {
    const readyAccounts = this.getReadyAccounts();

    if (readyAccounts.length === 0) {
      return null;
    }

    // scoring system
    const scoredAccounts = readyAccounts.map((state) => {
      let score = 0;

      // prioritize quota if available
      if (modelName) {
        const quotaStatus = this.quotaService.getQuotaStatus([
          { id: state.id, email: state.credential.email },
        ]);
        const accountQuota = quotaStatus.accounts[0]?.models.find(
          (m) => m.modelName === modelName,
        );

        if (accountQuota) {
          // high score for available quota
          score += accountQuota.quota * 1000;
          if (accountQuota.status === 'exhausted') {
            score -= 5000; // heavy penalty
          }
        }
      }

      // least used (penalty for high request count)
      score -= state.requestCount * 0.1;

      // recency (prefer older used accounts)
      if (state.lastUsed) {
        const secondsSinceLastUse = (Date.now() - state.lastUsed) / 1000;
        score += Math.min(secondsSinceLastUse, 3600); // max 1 hour bonus
      } else {
        score += 4000; // never used accounts get high priority
      }

      return { state, score };
    });

    // sort by score descending
    scoredAccounts.sort((a, b) => b.score - a.score);

    const firstAccount = scoredAccounts[0];
    if (!firstAccount) {
      return null;
    }

    const selected = firstAccount.state;

    // update current index for legacy compatibility if needed
    this.currentIndex = this.accountsList.indexOf(selected);

    return selected;
  }

  /**
   * Retrieves an account by its ID.
   *
   * @param accountId - The unique account identifier
   * @returns The account state or undefined if not found
   */
  getAccountById(accountId: string): AccountState | undefined {
    return this.accountStatesMap.get(accountId);
  }

  /**
   * Gets all configured account IDs.
   *
   * @returns Array of all account IDs
   */
  getAllAccountIds(): string[] {
    return Array.from(this.accountStatesMap.keys());
  }

  /**
   * Gets account info needed for quota status display.
   *
   * @returns Array of objects with account ID and email
   */
  getAccountsForQuotaStatus(): Array<{ id: string; email: string }> {
    return this.accountsList.map((state) => ({
      id: state.id,
      email: state.credential.email,
    }));
  }

  /**
   * Marks an account as being in cooldown due to rate limiting.
   * Uses exponential backoff for consecutive failures.
   *
   * @param accountId - The account ID to mark as cooldown
   */
  markCooldown(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.status = 'cooldown';
      state.consecutiveErrors++;
      const backoffFactor = Math.pow(
        2,
        Math.min(state.consecutiveErrors - 1, 6),
      ); // max 64x
      state.cooldownUntil =
        Date.now() + this.COOLDOWN_DURATION_MS * backoffFactor;
      state.errorCount++;
      this.logger.warn(
        `Account ${accountId} (${state.credential.email}) marked as cooldown (attempt ${state.consecutiveErrors}) until ${new Date(state.cooldownUntil).toISOString()}`,
      );
    }
  }

  /**
   * Marks an account as having a persistent error.
   *
   * @param accountId - The account ID to mark as error
   */
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

  /**
   * Marks a successful request for an account.
   * Resets consecutive error count and updates status if needed.
   *
   * @param accountId - The account ID that completed successfully
   */
  markSuccess(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.requestCount++;
      state.lastUsed = Date.now();
      state.consecutiveErrors = 0; // reset on success
      if (state.status === 'error' || state.status === 'cooldown') {
        state.status = 'ready';
        state.cooldownUntil = undefined;
      }
    }
  }

  /**
   * Adds a new account or updates an existing one by email.
   *
   * @param credential - The account credentials to add
   * @returns Object containing account ID, number, and whether it was new
   */
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
      consecutiveErrors: 0,
    };

    this.accountStatesMap.set(id, newState);
    this.accountsList.push(newState);
    this.emailToIdMap.set(credential.email, id);
    this.logger.log(`Added new account ${id}: ${credential.email}`);
    return { id, accountNumber, isNew: true };
  }

  /**
   * Gets the status of all accounts with optional credential information.
   *
   * @param includeCredentials - Whether to include full credentials and unmask emails
   * @returns Account status response with all account information
   */
  getStatus(includeCredentials = false): AccountStatusResponse {
    const accounts: AccountPublicInfo[] = this.accountsList.map(
      (state, index) => {
        // Only include full credentials when explicitly requested
        // This prevents accidental token exposure in logs and API responses
        let envText: string | undefined;
        if (includeCredentials) {
          const accountJson = JSON.stringify({
            email: state.credential.email,
            accessToken: state.credential.accessToken,
            refreshToken: state.credential.refreshToken,
            expiryDate: state.credential.expiryDate,
          });
          envText = `ANTIGRAVITY_ACCOUNTS_${index + 1}='${accountJson}'`;
        }

        // Show full email when authenticated (includeCredentials), mask otherwise
        const displayEmail = includeCredentials
          ? state.credential.email
          : this.maskEmail(state.credential.email);

        return {
          id: state.id,
          email: displayEmail,
          status: state.status,
          cooldownUntil: state.cooldownUntil,
          lastUsed: state.lastUsed,
          requestCount: state.requestCount,
          errorCount: state.errorCount,
          consecutiveErrors: state.consecutiveErrors,
          envText,
        };
      },
    );

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

  /**
   * Masks an email address for safe display in logs and API responses.
   * Example: "john.doe@gmail.com" -> "j******e@g***l.com"
   */
  maskEmail(email: string): string {
    const parts = email.split('@');
    const local = parts[0];
    const domain = parts[1];
    if (!local || !domain) return '***';

    const maskedLocal =
      local.length <= 2
        ? '*'.repeat(local.length)
        : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];

    const domainParts = domain.split('.');
    const domainName = domainParts[0];
    const tld = domainParts.slice(1).join('.');

    if (!domainName) return `${maskedLocal}@***`;

    const maskedDomain =
      domainName.length <= 2
        ? '*'.repeat(domainName.length)
        : domainName[0] +
          '*'.repeat(domainName.length - 2) +
          domainName[domainName.length - 1];

    return `${maskedLocal}@${maskedDomain}.${tld}`;
  }

  /**
   * Gets the earliest time when a cooldown account will become ready.
   *
   * @returns Timestamp in milliseconds or null if no accounts in cooldown
   */
  getEarliestCooldownEnd(): number | null {
    const cooldownAccounts = this.accountsList.filter(
      (s) => s.status === 'cooldown' && s.cooldownUntil,
    );
    if (cooldownAccounts.length === 0) return null;

    return Math.min(...cooldownAccounts.map((s) => s.cooldownUntil!));
  }

  /**
   * Checks if an account's access token is expired or about to expire.
   *
   * @param state - The account state to check
   * @returns True if the token needs refresh
   */
  isTokenExpired(state: AccountState): boolean {
    return Date.now() + this.REFRESH_BUFFER_MS >= state.credential.expiryDate;
  }

  /**
   * Gets a valid access token for an account, refreshing if needed.
   *
   * @param state - The account state
   * @returns Promise resolving to the access token
   * @throws Error if token refresh fails
   */
  async getAccessToken(state: AccountState): Promise<string> {
    if (this.isTokenExpired(state)) {
      await this.refreshToken(state);
    }
    return state.credential.accessToken;
  }

  /**
   * Refreshes the access token for an account using the refresh token.
   *
   * @param state - The account state to refresh
   * @throws Error if the refresh fails
   */
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

  /**
   * Gets authorization headers for API requests.
   *
   * @param state - The account state
   * @returns Promise resolving to headers object with Authorization and Content-Type
   */
  async getAuthHeaders(state: AccountState): Promise<Record<string, string>> {
    const token = await this.getAccessToken(state);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Gets the Google Cloud project ID for an account.
   * Discovers it automatically if not configured.
   *
   * @param state - The account state
   * @returns Promise resolving to the project ID
   */
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
