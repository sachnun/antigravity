export interface AccountCredential {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  projectId?: string;
}

export interface AccountState {
  id: string;
  credential: AccountCredential;
  status: 'ready' | 'cooldown' | 'error';
  cooldownUntil?: number;
  lastUsed?: number;
  requestCount: number;
  errorCount: number;
  discoveredProjectId?: string;
}

export interface AccountStatusResponse {
  totalAccounts: number;
  readyAccounts: number;
  cooldownAccounts: number;
  errorAccounts: number;
  currentIndex: number;
  accounts: AccountPublicInfo[];
}

export interface AccountPublicInfo {
  id: string;
  email: string;
  status: 'ready' | 'cooldown' | 'error';
  cooldownUntil?: number;
  lastUsed?: number;
  requestCount: number;
  errorCount: number;
}
