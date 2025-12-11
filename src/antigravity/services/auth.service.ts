import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { OAuthCredential, OAuthTokenResponse } from '../interfaces';

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: {
    id: string;
  };
  allowedTiers?: Array<{
    id: string;
    isDefault?: boolean;
    userDefinedCloudaicompanionProject?: boolean;
  }>;
}

interface OnboardUserResponse {
  done?: boolean;
  response?: {
    cloudaicompanionProject?: {
      id: string;
    };
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private credential: OAuthCredential | null = null;
  private discoveredProjectId: string | null = null;
  private projectDiscoveryPromise: Promise<string> | null = null;
  private readonly TOKEN_URI = 'https://oauth2.googleapis.com/token';
  private readonly CODE_ASSIST_ENDPOINT =
    'https://cloudcode-pa.googleapis.com/v1internal';
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.loadCredentials();
  }

  private loadCredentials(): void {
    const accessToken = this.configService.get<string>(
      'antigravity.accessToken',
    );
    const refreshToken = this.configService.get<string>(
      'antigravity.refreshToken',
    );

    if (!accessToken || !refreshToken) {
      this.logger.warn('Antigravity credentials not found in environment');
      return;
    }

    this.credential = {
      accessToken,
      refreshToken,
      expiryDate: this.configService.get<number>('antigravity.expiryDate') || 0,
      clientId: this.configService.get<string>('antigravity.clientId') || '',
      clientSecret:
        this.configService.get<string>('antigravity.clientSecret') || '',
      projectId: this.configService.get<string>('antigravity.projectId'),
      email: this.configService.get<string>('antigravity.email'),
    };

    this.logger.log(
      `Loaded Antigravity credentials for ${this.credential.email || 'unknown user'}`,
    );
  }

  hasCredentials(): boolean {
    return this.credential !== null && !!this.credential.refreshToken;
  }

  isTokenExpired(): boolean {
    if (!this.credential) return true;
    return Date.now() + this.REFRESH_BUFFER_MS >= this.credential.expiryDate;
  }

  async getAccessToken(): Promise<string> {
    if (!this.credential) {
      throw new Error('No Antigravity credentials available');
    }

    if (this.isTokenExpired()) {
      await this.refreshToken();
    }

    return this.credential.accessToken;
  }

  async refreshToken(): Promise<void> {
    if (!this.credential?.refreshToken) {
      throw new Error('No refresh token available');
    }

    this.logger.debug('Refreshing Antigravity access token...');

    try {
      const response = await axios.post<OAuthTokenResponse>(
        this.TOKEN_URI,
        {
          client_id: this.credential.clientId,
          client_secret: this.credential.clientSecret,
          refresh_token: this.credential.refreshToken,
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

      this.credential.accessToken = response.data.access_token;
      this.credential.expiryDate = Date.now() + response.data.expires_in * 1000;

      if (response.data.refresh_token) {
        this.credential.refreshToken = response.data.refresh_token;
      }

      this.logger.debug('Successfully refreshed access token');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to refresh token: ${errorMessage}`);
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getProjectId(): Promise<string> {
    // If user configured a project ID, use it
    if (this.credential?.projectId) {
      return this.credential.projectId;
    }

    // If we already discovered the project ID, return it
    if (this.discoveredProjectId) {
      return this.discoveredProjectId;
    }

    // If discovery is in progress, wait for it
    if (this.projectDiscoveryPromise) {
      return this.projectDiscoveryPromise;
    }

    // Start project discovery
    this.projectDiscoveryPromise = this.discoverProjectId();
    try {
      this.discoveredProjectId = await this.projectDiscoveryPromise;
      return this.discoveredProjectId;
    } finally {
      this.projectDiscoveryPromise = null;
    }
  }

  private async discoverProjectId(): Promise<string> {
    this.logger.debug('Starting project discovery via loadCodeAssist...');

    const token = await this.getAccessToken();
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
      // Step 1: Call loadCodeAssist to check if user is already onboarded
      const loadRequest = {
        cloudaicompanionProject: null,
        metadata: coreClientMetadata,
      };

      const loadResponse = await axios.post<LoadCodeAssistResponse>(
        `${this.CODE_ASSIST_ENDPOINT}:loadCodeAssist`,
        loadRequest,
        { headers, timeout: 20000 },
      );

      const data = loadResponse.data;
      const currentTier = data.currentTier;
      const serverProject = data.cloudaicompanionProject;

      this.logger.debug(
        `loadCodeAssist response: currentTier=${currentTier?.id}, project=${serverProject}`,
      );

      // If we have a project, we're done
      if (serverProject) {
        this.logger.log(`Discovered project ID: ${serverProject}`);
        return serverProject;
      }

      // If user has a currentTier but no project, something is weird
      // For free tier, we need to onboard
      if (!currentTier) {
        this.logger.log(
          'No existing session found, attempting to onboard user...',
        );

        // Find default tier for onboarding
        const allowedTiers = data.allowedTiers || [];
        const defaultTier = allowedTiers.find((t) => t.isDefault);
        const tierId = defaultTier?.id || 'free-tier';

        // Onboard user
        const projectId = await this.onboardUser(tierId, headers);
        if (projectId) {
          this.logger.log(`Onboarded with project ID: ${projectId}`);
          return projectId;
        }
      }

      // Fallback: generate a fake project ID (may not work)
      this.logger.warn(
        'Could not discover project ID, using generated fallback',
      );
      return this.generateFakeProjectId();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = error.response?.data as unknown;
        this.logger.error(
          `Project discovery failed: ${status} - ${JSON.stringify(body)}`,
        );
      } else {
        this.logger.error(`Project discovery failed: ${error}`);
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

    const onboardRequest = {
      tierId,
      cloudaicompanionProject: null, // Server will create/manage
      metadata: coreClientMetadata,
    };

    this.logger.debug(`Onboarding with tier: ${tierId}`);

    // Poll for onboarding completion (up to 2 minutes)
    for (let i = 0; i < 60; i++) {
      const response = await axios.post<OnboardUserResponse>(
        `${this.CODE_ASSIST_ENDPOINT}:onboardUser`,
        onboardRequest,
        { headers, timeout: 30000 },
      );

      const data = response.data;

      if (data.done) {
        const projectId = data.response?.cloudaicompanionProject?.id;
        if (projectId) {
          return projectId;
        }
        this.logger.warn('Onboarding completed but no project ID returned');
        return null;
      }

      // Wait 2 seconds before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if ((i + 1) % 15 === 0) {
        this.logger.debug(
          `Still waiting for onboarding... (${(i + 1) * 2}s elapsed)`,
        );
      }
    }

    this.logger.error('Onboarding timed out after 2 minutes');
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

  // Update credentials (used by OAuth flow)
  updateCredentials(creds: Partial<OAuthCredential>): void {
    if (!this.credential) {
      this.credential = {
        accessToken: '',
        refreshToken: '',
        expiryDate: 0,
        clientId: this.configService.get<string>('antigravity.clientId') || '',
        clientSecret:
          this.configService.get<string>('antigravity.clientSecret') || '',
      };
    }
    Object.assign(this.credential, creds);
    this.logger.log('Credentials updated');
  }
}
