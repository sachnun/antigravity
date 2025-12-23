interface AccountCredential {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  projectId?: string;
}

function loadAccountsFromEnv(): AccountCredential[] {
  const accounts: AccountCredential[] = [];
  let index = 1;

  while (true) {
    const envValue = process.env[`ANTIGRAVITY_ACCOUNTS_${index}`];
    if (!envValue) break;

    try {
      const parsed = JSON.parse(envValue) as AccountCredential;
      if (
        parsed.email &&
        parsed.accessToken &&
        parsed.refreshToken &&
        parsed.expiryDate
      ) {
        accounts.push(parsed);
      }
    } catch {
      console.warn(
        `Failed to parse ANTIGRAVITY_ACCOUNTS_${index}, skipping...`,
      );
    }

    index++;
  }

  return accounts;
}

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  proxyApiKey: process.env.PROXY_API_KEY ?? '',

  // OAuth credentials must be configured via environment variables
  // No default values to prevent accidental credential exposure
  antigravity: {
    clientId: process.env.ANTIGRAVITY_CLIENT_ID ?? '',
    clientSecret: process.env.ANTIGRAVITY_CLIENT_SECRET ?? '',
  },

  accounts: {
    list: loadAccountsFromEnv(),
    cooldownDurationMs: parseInt(
      process.env.COOLDOWN_DURATION_MS ?? '60000',
      10,
    ),
    maxRetryAccounts: parseInt(process.env.MAX_RETRY_ACCOUNTS ?? '3', 10),
  },

  oauth: {
    callbackPort: parseInt(process.env.OAUTH_CALLBACK_PORT ?? '51121', 10),
    callbackPath: process.env.OAUTH_CALLBACK_PATH || '/oauthcallback',
    tokenUri: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/cclog',
      'https://www.googleapis.com/auth/experimentsandconfigs',
    ],
  },
});
