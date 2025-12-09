import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('authorize')
  authorize(@Res() res: Response) {
    const authUrl = this.oauthService.getAuthorizationUrl();
    res.redirect(authUrl);
  }

  @Get('callback')
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
        email: result.email || 'unknown',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiryDate: result.expiryDate,
      });

      const escapedJson = accountJson
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

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
            .warning { background: #3d2f0d; border-left-color: #eab308; }
            code { background: #2d2d2d; padding: 2px 6px; border-radius: 4px; }
            .success-icon { font-size: 48px; }
          </style>
        </head>
        <body>
          <div class="success-icon">✅</div>
          <h1>Authentication Successful!</h1>
          ${result.email ? `<p class="email">Logged in as: <strong>${result.email}</strong></p>` : ''}
          
          <h2>Add to .env file</h2>
          <pre id="env-content">ANTIGRAVITY_ACCOUNTS_1='${escapedJson}'</pre>
          <button class="copy-btn" onclick="copyToClipboard('env-content', this)">Copy to Clipboard</button>
          
          <div class="note">
            <strong>Adding more accounts?</strong><br>
            Use incrementing numbers: <code>ANTIGRAVITY_ACCOUNTS_2</code>, <code>ANTIGRAVITY_ACCOUNTS_3</code>, etc.<br>
            The system will automatically rotate between all accounts to avoid rate limits.
          </div>

          <div class="note warning">
            <strong>Important:</strong> After adding to <code>.env</code>, restart the server with <code>npm run start:dev</code>
          </div>

          <h2>Check Account Status</h2>
          <p>After restarting, visit <a href="/accounts/status" style="color: #3b82f6;">/accounts/status</a> to see all configured accounts.</p>

          <script>
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
        <head><title>OAuth Error</title></head>
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
  getStatus() {
    return {
      authUrl: this.oauthService.getAuthorizationUrl(),
      callbackUrl: this.oauthService.getRedirectUri(),
      instructions: 'Visit /oauth/authorize to start authentication',
    };
  }
}
