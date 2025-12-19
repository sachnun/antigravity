import { Injectable } from '@nestjs/common';
import { AccountStatusResponse } from './accounts/interfaces';
import { QuotaStatusResponse } from './quota/interfaces';
import { AVAILABLE_MODELS } from './antigravity/constants/models.constant';

@Injectable()
export class AppService {
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getDashboard(
    status: AccountStatusResponse,
    quotaStatus: QuotaStatusResponse,
  ): string {
    const modelsList = AVAILABLE_MODELS.map(
      (m) => `<span class="tag">${m}</span>`,
    ).join('');

    const accountsRows = status.accounts
      .map((acc) => {
        const accountQuota = quotaStatus.accounts.find(
          (q) => q.accountId === acc.id,
        );

        let quotaHtml = '<div class="quota-container">';
        if (accountQuota) {
          const relevantModels = accountQuota.models.filter((m) =>
            AVAILABLE_MODELS.some(
              (am) => am.toLowerCase() === m.modelName.toLowerCase().trim(),
            ),
          );

          if (relevantModels.length > 0) {
            quotaHtml += relevantModels
              .map((m) => {
                const percentage = Math.round((1 - m.quota) * 100);
                const colorClass =
                  percentage > 90
                    ? 'error-color'
                    : percentage > 70
                      ? 'warning-color'
                      : 'success-color';
                return `
              <div class="quota-item">
                <span class="quota-label">${m.modelName}</span>
                <div class="quota-bar-container">
                  <div class="quota-bar ${colorClass}" style="width: ${percentage}%"></div>
                </div>
                <span class="quota-value">${percentage}%</span>
              </div>
            `;
              })
              .join('');
          } else {
            quotaHtml += '<span class="text-dim">No quota info</span>';
          }
        } else {
          quotaHtml += '<span class="text-dim">Loading quota...</span>';
        }
        quotaHtml += '</div>';

        const statusClass =
          acc.status === 'ready'
            ? 'status-ready'
            : acc.status === 'cooldown'
              ? 'status-cooldown'
              : 'status-error';

        return `
      <tr class="table-row">
        <td><code>${acc.id}</code></td>
        <td>${acc.email}</td>
        <td><span class="status-badge ${statusClass}">${acc.status.toUpperCase()}</span></td>
        <td>${quotaHtml}</td>
        <td class="text-right">${acc.requestCount}</td>
        <td class="text-right text-error">${acc.errorCount}</td>
        <td class="text-dim">
          ${acc.lastUsed ? new Date(acc.lastUsed).toLocaleTimeString() : '-'}
        </td>
      </tr>
    `;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Proxy Dashboard</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 40px; background: #0f0f0f; color: #e0e0e0; }
        h1 { color: #22c55e; margin: 0; }
        h2 { color: #3b82f6; margin-top: 30px; font-size: 1.5rem; letter-spacing: -0.5px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #1f2937; }
        .subtitle { color: #9ca3af; margin-top: 5px; font-size: 0.95rem; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #1e1e1e; padding: 24px; border-radius: 12px; border: 1px solid #333; transition: transform 0.2s; }
        .stat-card:hover { transform: translateY(-2px); border-color: #4b5563; }
        .stat-label { color: #9ca3af; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .stat-value { font-size: 36px; font-weight: 800; margin-top: 10px; color: #e0e0e0; line-height: 1; }
        .text-success { color: #22c55e; }
        .text-warning { color: #eab308; }
        .text-error { color: #ef4444; }
        .text-dim { color: #6b7280; }
        
        .section-box { background: #1e1e1e; padding: 25px; border-radius: 12px; border: 1px solid #333; margin-bottom: 30px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
        
        .tag { display: inline-flex; align-items: center; background: #2d2d2d; color: #e0e0e0; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; margin-right: 8px; margin-bottom: 8px; border: 1px solid #404040; transition: all 0.2s; }
        .tag:hover { background: #374151; border-color: #4b5563; }
        
        table { w-full: 100%; border-collapse: separate; border-spacing: 0; width: 100%; }
        th { text-align: left; color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 16px 20px; border-bottom: 1px solid #333; letter-spacing: 0.5px; }
        td { padding: 16px 20px; border-bottom: 1px solid #2d2d2d; vertical-align: top; font-size: 14px; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: #262626; }
        .text-right { text-align: right; }
        
        code { background: #111827; padding: 4px 8px; border-radius: 4px; font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace; color: #818cf8; font-size: 0.85em; border: 1px solid #1f2937; }
        
        .status-badge { padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .status-ready { background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }
        .status-cooldown { background: rgba(234, 179, 8, 0.1); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.2); }
        .status-error { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
        
        .quota-container { display: flex; flex-direction: column; gap: 10px; }
        .quota-item { display: flex; align-items: center; font-size: 12px; }
        .quota-label { width: 140px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .quota-bar-container { flex: 1; height: 8px; background: #111827; border-radius: 4px; overflow: hidden; margin: 0 12px; border: 1px solid #374151; }
        .quota-bar { height: 100%; border-radius: 4px; transition: width 0.5s ease-out; }
        .quota-value { width: 40px; text-align: right; font-family: monospace; color: #d4d4d4; font-weight: 600; }
        
        .success-color { background-color: #22c55e; }
        .warning-color { background-color: #eab308; }
        .error-color { background-color: #ef4444; }
        
        .btn { display: inline-block; background: #3b82f6; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px; transition: background 0.2s; }
        .btn:hover { background: #2563eb; }
        
        .table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        
        footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 40px; }
        footer a { color: #6b7280; text-decoration: none; }
        footer a:hover { color: #9ca3af; text-decoration: underline; }

        .btn-refresh { background: #374151; color: #e0e0e0; border: 1px solid #4b5563; font-size: 12px; padding: 6px 12px; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .btn-refresh:hover { background: #4b5563; border-color: #6b7280; color: white; }

        .playground-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .editor-container { display: flex; flex-direction: column; gap: 10px; }
        textarea { background: #111827; color: #d1d5db; border: 1px solid #374151; border-radius: 8px; padding: 15px; font-family: monospace; font-size: 13px; resize: vertical; min-height: 200px; }
        .response-area { background: #000; color: #10b981; border: 1px solid #333; border-radius: 8px; padding: 15px; font-family: monospace; font-size: 13px; min-height: 200px; overflow: auto; white-space: pre-wrap; }
        .input-group { display: flex; flex-direction: column; gap: 5px; }
        label { font-size: 12px; color: #9ca3af; font-weight: bold; text-transform: uppercase; }
        input, select { background: #2d2d2d; color: #e0e0e0; border: 1px solid #404040; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
    </style>
</head>
<body>
    <div style="max-width: 1200px; margin: 0 auto;">
        <!-- Header -->
        <header class="header">
            <div>
                <h1 class="text-3xl font-bold">Antigravity Proxy</h1>
                <p class="subtitle">Reverse Engineering Proxy</p>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 12px; color: #9ca3af; text-transform: uppercase;">System Status</div>
                <div style="font-size: 20px; font-weight: bold; color: #22c55e;">OPERATIONAL</div>
            </div>
        </header>

        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Total Accounts</div>
                <div class="stat-value">${status.totalAccounts}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Ready</div>
                <div class="stat-value text-success">${status.readyAccounts}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Cooldown</div>
                <div class="stat-value text-warning">${status.cooldownAccounts}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Errors</div>
                <div class="stat-value text-error">${status.errorAccounts}</div>
            </div>
        </div>

        <!-- Available Models -->
        <div class="section-box">
            <h2 style="margin-top: 0; margin-bottom: 15px; font-size: 1.2rem; color: #e0e0e0;">Available Models</h2>
            <div>
                ${modelsList}
            </div>
        </div>

        <!-- Accounts Table -->
        <div class="section-box" style="padding: 0; overflow: hidden;">
            <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 1.2rem; color: #e0e0e0;">Accounts Rotation</h2>
                <div style="display: flex; gap: 10px;">
                    <a href="/quota/refresh" class="btn-refresh">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Refresh Quota
                    </a>
                    <a href="/oauth/authorize" class="btn">Add Account</a>
                </div>
            </div>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Quota Usage</th>
                            <th class="text-right">Requests</th>
                            <th class="text-right">Errors</th>
                            <th>Last Used</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${accountsRows}
                    </tbody>
                </table>
            </div>
            ${
              status.totalAccounts === 0
                ? `
            <div style="padding: 40px; text-align: center; color: #6b7280;">
                <p style="margin-bottom: 10px;">No accounts configured yet.</p>
                <p style="font-size: 14px;">Click "Add Account" to start the OAuth flow.</p>
            </div>
            `
                : ''
            }
        </div>

        <!-- API Playground -->
        <div class="section-box">
            <h2 style="margin-top: 0; margin-bottom: 20px; font-size: 1.2rem; color: #e0e0e0;">API Playground</h2>
            <div class="playground-grid">
                <div class="editor-container">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="input-group">
                            <label>Endpoint</label>
                            <select id="api-endpoint" onchange="updateDefaultPayload()">
                                <option value="/v1/chat/completions">POST /v1/chat/completions (OpenAI)</option>
                                <option value="/v1/messages">POST /v1/messages (Anthropic)</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Model</label>
                            <select id="api-model">
                                ${AVAILABLE_MODELS.map((m) => `<option value="${m}">${m}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>Target Account (Optional)</label>
                        <select id="api-account">
                            <option value="">Auto-rotate (Default)</option>
                            ${status.accounts.map((acc) => `<option value="${acc.id}">${acc.id} (${acc.email})</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Proxy API Key (Authorization Bearer / X-API-Key)</label>
                        <input type="password" id="api-key" placeholder="Optional if PROXY_API_KEY is empty">
                    </div>
                    <div class="input-group">
                        <label>Request Body (JSON)</label>
                        <textarea id="api-payload"></textarea>
                    </div>
                    <button class="btn" onclick="sendTestRequest()" id="send-btn" style="width: 100%; padding: 12px;">Send Request</button>
                </div>
                <div class="editor-container">
                    <label>Response</label>
                    <div id="api-response" class="response-area">Waiting for request...</div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <footer>
            <p>Antigravity v1.0.0 &bull; <a href="/v1/models">/v1/models</a> &bull; <a href="/health">/health</a></p>
        </footer>
    </div>

    <script>
        const payloads = {
            '/v1/chat/completions': {
                "model": "",
                "messages": [{"role": "user", "content": "Hello, how are you?"}],
                "reasoning_effort": "low",
                "stream": false
            },
            '/v1/messages': {
                "model": "",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": "Hello, how are you?"}],
                "reasoning_effort": "low",
                "stream": false
            }
        };

        function updateDefaultPayload() {
            const endpoint = document.getElementById('api-endpoint').value;
            const model = document.getElementById('api-model').value;
            const payload = {...payloads[endpoint]};
            payload.model = model;
            document.getElementById('api-payload').value = JSON.stringify(payload, null, 2);
        }

        async function sendTestRequest() {
            const endpoint = document.getElementById('api-endpoint').value;
            const payloadStr = document.getElementById('api-payload').value;
            const apiKey = document.getElementById('api-key').value;
            const accountId = document.getElementById('api-account').value;
            const responseArea = document.getElementById('api-response');
            const btn = document.getElementById('send-btn');

            try {
                const payload = JSON.parse(payloadStr);
                responseArea.textContent = 'Sending request...';
                responseArea.style.color = '#3b82f6';
                btn.disabled = true;
                btn.style.opacity = '0.5';

                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) {
                    if (endpoint === '/v1/messages') {
                        headers['x-api-key'] = apiKey;
                    } else {
                        headers['Authorization'] = 'Bearer ' + apiKey;
                    }
                }
                if (accountId) {
                    headers['x-antigravity-account'] = accountId;
                }

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                responseArea.textContent = JSON.stringify(data, null, 2);
                responseArea.style.color = res.ok ? '#10b981' : '#ef4444';
            } catch (err) {
                responseArea.textContent = 'Error: ' + err.message;
                responseArea.style.color = '#ef4444';
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }

        // Initialize default
        updateDefaultPayload();
        // Sync model changes to payload
        document.getElementById('api-model').addEventListener('change', updateDefaultPayload);
    </script>
</body>
</html>
    `;
  }
}
