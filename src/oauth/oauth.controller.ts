import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('oauth')
@ApiTags('OAuth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('authorize')
  @ApiOperation({
    summary: 'Start OAuth flow',
    description: 'Redirects to Google OAuth authorization page',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  authorize(@Res() res: Response) {
    const authUrl = this.oauthService.getAuthorizationUrl();
    res.redirect(authUrl);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback',
    description:
      'Handles OAuth callback from Google and exchanges code for tokens',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code from Google',
  })
  @ApiQuery({ name: 'error', required: false, description: 'Error from OAuth' })
  @ApiResponse({
    status: 200,
    description: 'Success page with account credentials',
  })
  @ApiResponse({ status: 400, description: 'Missing authorization code' })
  @ApiResponse({ status: 500, description: 'Token exchange failed' })
  async callback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      res.status(400).send(`
        <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error: ${error}</p>
          <p><a href="/oauth/authorize">Try again</a></p>
        </body>
        </html>
      `);
      return;
    }

    if (!code) {
      throw new HttpException(
        'Missing authorization code',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.oauthService.exchangeCodeForTokens(code);

      const accountJson = JSON.stringify({
        email: result.email,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiryDate: result.expiryDate,
      });

      const escapedJson = accountJson
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const actionText = result.isNewAccount
        ? `Added as new account #${result.accountNumber}`
        : `Updated existing account #${result.accountNumber}`;

      res.status(200).send(`
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 900px; margin: 50px auto; padding: 20px; background: #0f0f0f; color: #e0e0e0; }
            h1 { color: #22c55e; }
            h2 { color: #3b82f6; margin-top: 30px; }
            pre { background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
            .copy-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
            .copy-btn:hover { background: #2563eb; }
            .email { color: #9ca3af; }
            .note { background: #1e3a5f; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #3b82f6; }
            .success-box { background: #14532d; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #22c55e; }
            .warning { background: #3d2f0d; border-left-color: #eab308; }
            code { background: #2d2d2d; padding: 2px 6px; border-radius: 4px; }
            .success-icon { font-size: 48px; }
            .stats { display: flex; gap: 20px; margin-top: 15px; }
            .stat { background: #1e1e1e; padding: 15px 25px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #22c55e; }
            .stat-label { color: #9ca3af; font-size: 12px; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="success-icon">✅</div>
          <h1>Authentication Successful!</h1>
          <p class="email">Logged in as: <strong>${result.email}</strong></p>
          
          <div class="success-box">
            <strong>${actionText}</strong><br>
            Account is now active and ready to use. No restart required!
          </div>

          <div class="stats">
            <div class="stat">
              <div class="stat-value">${result.totalAccounts}</div>
              <div class="stat-label">Total Accounts</div>
            </div>
            <div class="stat">
              <div class="stat-value">#${result.accountNumber}</div>
              <div class="stat-label">This Account</div>
            </div>
          </div>

          <h2>Want to persist after restart?</h2>
          <p>Copy this to your <code>.env</code> file:</p>
          <pre id="env-content">ANTIGRAVITY_ACCOUNTS_${result.accountNumber}='${escapedJson}'</pre>
          <button class="copy-btn" onclick="copyToClipboard('env-content', this)">Copy to Clipboard</button>

          <div class="note">
            <strong>Adding more accounts?</strong><br>
            Just visit <a href="/oauth/authorize" style="color: #3b82f6;">/oauth/authorize</a> again to add another account.<br>
            The system will automatically assign the next available number.
          </div>

          <div class="note warning">
            <strong>Note:</strong> Accounts added via OAuth are stored in memory only.<br>
            Add to <code>.env</code> if you want them to persist after server restart.
          </div>

          <h2>Check Account Status</h2>
          <p>Visit <a href="/accounts/status" style="color: #3b82f6;">/accounts/status</a> to see all configured accounts.</p>

          <script>
            // Communicate with parent window if exists (Popup Mode)
            const messageData = {
              type: 'OAUTH_SUCCESS',
              email: '${result.email}',
              accountNumber: ${result.accountNumber},
              envText: "ANTIGRAVITY_ACCOUNTS_${result.accountNumber}='${escapedJson}'"
            };

            if (window.opener) {
              window.opener.postMessage(messageData, '*');
            } else if (window.parent !== window) {
              // Iframe / Modal Mode
              window.parent.postMessage(messageData, '*');
            }

            function copyToClipboard(elementId, button) {
              const text = document.getElementById(elementId).textContent;
              navigator.clipboard.writeText(text).then(() => {
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.style.background = '#22c55e';
                setTimeout(() => {
                  button.textContent = originalText;
                  button.style.background = '#3b82f6';
                }, 2000);
              });
            }
          </script>
        </body>
        </html>
      `);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).send(`
        <html>
        <head>
          <title>OAuth Error</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #0f0f0f; color: #e0e0e0; text-align: center; }
            h1 { color: #ef4444; }
            a { color: #3b82f6; }
          </style>
          <script>
            const errorData = {
              type: 'OAUTH_ERROR',
              message: '${message.replace(/'/g, "\\'")}'
            };
            if (window.opener) {
              window.opener.postMessage(errorData, '*');
            } else if (window.parent !== window) {
              window.parent.postMessage(errorData, '*');
            }
          </script>
        </head>
        <body>
          <h1>Token Exchange Failed</h1>
          <p>Error: ${message}</p>
          <p><a href="/oauth/authorize">Try again</a></p>
        </body>
        </html>
      `);
    }
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get OAuth status',
    description: 'Returns OAuth configuration information',
  })
  @ApiResponse({ status: 200, description: 'OAuth status' })
  getStatus() {
    return {
      authUrl: this.oauthService.getAuthorizationUrl(),
      callbackUrl: this.oauthService.getRedirectUri(),
      instructions: 'Visit /oauth/authorize to start authentication',
    };
  }
}
