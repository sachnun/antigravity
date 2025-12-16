import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  QuotaCacheEntry,
  FetchAvailableModelsResponse,
  QuotaStatusResponse,
  AccountQuotaStatus,
  ModelQuotaStatus,
} from './interfaces';
import { AccountState } from '../accounts/interfaces';
import { BASE_URLS, USER_AGENT } from '../antigravity/constants';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly quotaCache = new Map<string, Map<string, QuotaCacheEntry>>();
  private readonly quotaThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.quotaThreshold = this.configService.get<number>(
      'QUOTA_THRESHOLD',
      0.01,
    );
  }

  async fetchQuotaFromUpstream(
    accountState: AccountState,
    accessToken: string,
    projectId?: string,
  ): Promise<void> {
    const endpoint = ':fetchAvailableModels';

    for (const baseUrl of BASE_URLS) {
      const url = `${baseUrl}${endpoint}`;

      try {
        this.logger.debug(
          `Fetching quota from ${url} for account ${accountState.id}`,
        );

        const response = await axios.post<FetchAvailableModelsResponse>(
          url,
          { project: projectId || '' },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'User-Agent': USER_AGENT,
            },
            timeout: 30000,
          },
        );

        if (response.data?.models) {
          this.updateQuotasFromModels(accountState.id, response.data.models);
          this.logger.log(
            `Updated quotas for account ${accountState.id}: ${Object.keys(response.data.models).length} models`,
          );
          return;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to fetch quota from ${baseUrl}: ${errorMessage}`,
        );
        continue;
      }
    }

    this.logger.error(
      `Failed to fetch quota from all endpoints for account ${accountState.id}`,
    );
  }

  private updateQuotasFromModels(
    accountId: string,
    models: FetchAvailableModelsResponse['models'],
  ): void {
    let accountCache = this.quotaCache.get(accountId);
    if (!accountCache) {
      accountCache = new Map();
      this.quotaCache.set(accountId, accountCache);
    }

    for (const [modelName, modelInfo] of Object.entries(models)) {
      if (modelInfo.quotaInfo) {
        const quota = modelInfo.quotaInfo.remainingFraction ?? 1.0;
        const resetTime = modelInfo.quotaInfo.resetTime
          ? new Date(modelInfo.quotaInfo.resetTime)
          : undefined;

        accountCache.set(modelName, {
          quota,
          resetTime,
          lastFetchedAt: new Date(),
        });

        this.logger.debug(
          `Quota updated: account=${accountId}, model=${modelName}, quota=${quota.toFixed(4)}`,
        );
      }
    }
  }

  getQuotaStatus(
    accounts: Array<{ id: string; email: string }>,
  ): QuotaStatusResponse {
    const accountStatuses: AccountQuotaStatus[] = accounts.map((account) => {
      const accountCache = this.quotaCache.get(account.id);
      const models: ModelQuotaStatus[] = [];

      if (accountCache) {
        for (const [modelName, entry] of accountCache.entries()) {
          models.push({
            modelName,
            quota: entry.quota,
            resetTime: entry.resetTime?.toISOString(),
            status:
              entry.quota > this.quotaThreshold ? 'available' : 'exhausted',
          });
        }
      }

      const lastFetched =
        accountCache && accountCache.size > 0
          ? Array.from(accountCache.values()).reduce(
              (latest, entry) =>
                entry.lastFetchedAt > latest ? entry.lastFetchedAt : latest,
              new Date(0),
            )
          : undefined;

      return {
        accountId: account.id,
        email: account.email,
        models: models.sort((a, b) => a.modelName.localeCompare(b.modelName)),
        lastFetchedAt: lastFetched?.toISOString(),
      };
    });

    return {
      totalAccounts: accounts.length,
      accounts: accountStatuses,
    };
  }
}
