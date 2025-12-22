import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { AccountsService } from './accounts.service';

@Controller('accounts')
@ApiTags('Accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get account status',
    description: 'Returns status of all configured accounts',
  })
  @ApiResponse({ status: 200, description: 'Account status' })
  getStatus() {
    return this.accountsService.getStatus();
  }

  @Get('add')
  @ApiOperation({
    summary: 'Add account page',
    description: 'Returns a simple HTML page to add accounts via popup',
  })
  getAddPage(@Res() res: Response) {
    res.status(200).send(`
      <html>
      <head>
        <title>Antigravity - Add Account</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #0f0f0f; color: #e0e0e0; text-align: center; }
          .btn { background: #3b82f6; color: white; border: none; padding: 15px 30px; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: bold; transition: all 0.2s; }
          .btn:hover { background: #2563eb; transform: translateY(-2px); }
          .btn:active { transform: translateY(0); }
          .status { margin-top: 30px; padding: 20px; border-radius: 8px; display: none; }
          .success { background: #14532d; border-left: 4px solid #22c55e; display: block; }
          .error { background: #451a1a; border-left: 4px solid #ef4444; display: block; }
          .account-list { margin-top: 40px; text-align: left; background: #1e1e1e; padding: 20px; border-radius: 8px; }
          h1 { color: #3b82f6; }
          
          /* Modal Styles */
          .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: #1e1e1e; padding: 0; border-radius: 12px; width: 90%; max-width: 650px; height: 80vh; position: relative; border: 1px solid #333; overflow: hidden; }
          .modal-header { padding: 15px 20px; background: #2d2d2d; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
          .modal-close { background: none; border: none; color: #9ca3af; font-size: 24px; cursor: pointer; }
          .modal-body { height: calc(100% - 60px); width: 100%; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <h1>Add Google Account</h1>
        <p>Click the button below to sign in with your Google account.</p>
        
        <button class="btn" onclick="openModal()">Login with Google</button>

        <div id="auth-modal" class="modal-overlay">
          <div class="modal-content">
            <div class="modal-header">
              <span style="font-weight: bold">Google Authentication</span>
              <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
              <iframe id="auth-iframe"></iframe>
            </div>
          </div>
        </div>

        <div id="status-box" class="status"></div>

        <div class="account-list">
          <h3>Current Accounts</h3>
          <ul id="accounts-ul">Loading...</ul>
          <a href="/accounts/status" style="color: #3b82f6; font-size: 14px;">View detailed status</a>
        </div>

        <script>
          function openModal() {
            document.getElementById('auth-modal').style.display = 'flex';
            document.getElementById('auth-iframe').src = '/oauth/authorize';
          }

          function closeModal() {
            document.getElementById('auth-modal').style.display = 'none';
            document.getElementById('auth-iframe').src = 'about:blank';
          }

          window.addEventListener('message', (event) => {
            if (event.data.type === 'OAUTH_SUCCESS') {
              const statusBox = document.getElementById('status-box');
              statusBox.className = 'status success';
              statusBox.innerHTML = \`<strong>Success!</strong> Account <strong>\${event.data.email}</strong> added as #\${event.data.accountNumber}.\`;
              refreshAccounts();
            }
            if (event.data.type === 'OAUTH_ERROR') {
              const statusBox = document.getElementById('status-box');
              statusBox.className = 'status error';
              statusBox.innerHTML = \`<strong>Error:</strong> \${event.data.message}\`;
            }
          });

          async function refreshAccounts() {
            try {
              const res = await fetch('/accounts/status');
              const data = await res.json();
              const ul = document.getElementById('accounts-ul');
              ul.innerHTML = data.accounts.map(acc => \`<li>\${acc.email} (\${acc.status})</li>\`).join('');
            } catch (e) {
              console.error('Failed to refresh accounts', e);
            }
          }

          refreshAccounts();
        </script>
      </body>
      </html>
    `);
  }
}
