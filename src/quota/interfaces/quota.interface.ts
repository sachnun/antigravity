export interface QuotaInfo {
  remainingFraction: number;
  resetTime?: string;
}

export interface QuotaCacheEntry {
  quota: number;
  resetTime?: Date;
  lastFetchedAt: Date;
}

export interface FetchAvailableModelsResponse {
  models: Record<
    string,
    {
      quotaInfo?: QuotaInfo;
      [key: string]: unknown;
    }
  >;
}

export interface QuotaStatusResponse {
  totalAccounts: number;
  accounts: AccountQuotaStatus[];
  groupedQuota?: GroupedQuotaStatus;
}

export interface AccountQuotaStatus {
  accountId: string;
  email: string;
  models: ModelQuotaStatus[];
  lastFetchedAt?: string;
}

export interface ModelQuotaStatus {
  modelName: string;
  quota: number;
  resetTime?: string;
  status: 'available' | 'exhausted' | 'unknown';
}

export interface GroupedQuotaStatus {
  groups: QuotaGroup[];
}

export interface QuotaGroup {
  name: string;
  displayName: string;
  models: string[];
  totalQuota: number;
  averageQuota: number;
  status: 'available' | 'limited' | 'exhausted';
}
