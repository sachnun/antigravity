import { Injectable } from '@nestjs/common';
import { AccountStatusResponse } from './accounts/interfaces';
import { QuotaStatusResponse } from './quota/interfaces';
import {
  AVAILABLE_MODELS,
  MODEL_OWNERS,
  DEFAULT_MAX_TOKENS,
  THINKING_LEVEL_MODELS,
  THINKING_ONLY_MODELS,
} from './antigravity/constants/models.constant';

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
    const accountsRows = status.accounts
      .map((acc, index) => {
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

        const statusIcon =
          acc.status === 'ready'
            ? `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
            : acc.status === 'cooldown'
              ? `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
              : `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;

        return `
      <tr class="table-row" style="animation-delay: ${index * 0.05}s">
        <td>
          <code>${acc.id}</code>
        </td>
        <td>
          <div class="email-cell">
            <span class="email-text">${acc.email}</span>
          </div>
        </td>
        <td>
          <span class="status-badge ${statusClass}">
            ${statusIcon}
            ${acc.status.toUpperCase()}
          </span>
        </td>
        <td>${quotaHtml}</td>
        <td class="text-right">
          <span class="metric-value">${acc.requestCount}</span>
        </td>
        <td class="text-right">
          <span class="metric-value ${acc.errorCount > 0 ? 'text-error' : ''}">${acc.errorCount}</span>
        </td>
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
        :root {
          --bg-primary: #0a0a0a;
          --bg-secondary: #141414;
          --bg-tertiary: #1e1e1e;
          --bg-hover: #252525;
          --border-color: #2a2a2a;
          --border-hover: #3a3a3a;
          --text-primary: #f0f0f0;
          --text-secondary: #a0a0a0;
          --text-dim: #606060;
          --accent-green: #22c55e;
          --accent-green-dim: rgba(34, 197, 94, 0.15);
          --accent-blue: #3b82f6;
          --accent-blue-dim: rgba(59, 130, 246, 0.15);
          --accent-yellow: #eab308;
          --accent-yellow-dim: rgba(234, 179, 8, 0.15);
          --accent-red: #ef4444;
          --accent-red-dim: rgba(239, 68, 68, 0.15);
          --accent-purple: #a855f7;
          --accent-purple-dim: rgba(168, 85, 247, 0.15);
          --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
          --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
          --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
          --radius-sm: 6px;
          --radius-md: 10px;
          --radius-lg: 16px;
          --radius-xl: 24px;
          --transition-fast: 0.15s ease;
          --transition-normal: 0.25s ease;
          --transition-slow: 0.4s ease;
        }

        [data-theme="light"] {
          --bg-primary: #f8fafc;
          --bg-secondary: #ffffff;
          --bg-tertiary: #f1f5f9;
          --bg-hover: #e2e8f0;
          --border-color: #e2e8f0;
          --border-hover: #cbd5e1;
          --text-primary: #0f172a;
          --text-secondary: #475569;
          --text-dim: #94a3b8;
          --accent-green: #16a34a;
          --accent-green-dim: rgba(22, 163, 74, 0.1);
          --accent-blue: #2563eb;
          --accent-blue-dim: rgba(37, 99, 235, 0.1);
          --accent-yellow: #ca8a04;
          --accent-yellow-dim: rgba(202, 138, 4, 0.1);
          --accent-red: #dc2626;
          --accent-red-dim: rgba(220, 38, 38, 0.1);
          --accent-purple: #9333ea;
          --accent-purple-dim: rgba(147, 51, 234, 0.1);
          --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
          --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
          --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.15);
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: var(--bg-primary);
          color: var(--text-primary);
          line-height: 1.6;
          min-height: 100vh;
        }

        /* Animations */
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 5px var(--accent-green), 0 0 10px var(--accent-green-dim);
          }
          50% {
            box-shadow: 0 0 10px var(--accent-green), 0 0 20px var(--accent-green-dim);
          }
        }

        .animate-in {
          animation: fadeInUp 0.5s ease forwards;
        }

        .table-row {
          animation: fadeInUp 0.4s ease forwards;
          opacity: 0;
        }

        /* Layout */
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 40px;
        }

        /* Header */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 40px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--border-color);
          animation: fadeInUp 0.5s ease;
        }

        .header-left {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .logo-group {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, var(--accent-green), var(--accent-blue));
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-md);
        }

        .logo-icon svg {
          width: 28px;
          height: 28px;
          color: white;
        }

        .logo-text h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.5px;
        }

        .logo-text .tagline {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .nav-tabs {
          display: flex;
          gap: 8px;
          background: var(--bg-secondary);
          padding: 6px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
        }

        .nav-tab {
          padding: 10px 20px;
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-secondary);
          text-decoration: none;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          background: transparent;
        }

        .nav-tab svg {
          width: 18px;
          height: 18px;
        }

        .nav-tab:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }

        .nav-tab.active {
          background: var(--accent-green);
          color: white;
          box-shadow: var(--shadow-sm);
        }

        .header-right {
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }

        .system-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: var(--accent-green-dim);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: var(--radius-lg);
        }

        .status-dot {
          width: 10px;
          height: 10px;
          background: var(--accent-green);
          border-radius: 50%;
          animation: glow 2s ease-in-out infinite;
        }

        .status-text {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--accent-green);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: var(--bg-secondary);
          padding: 24px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
          transition: all var(--transition-normal);
          position: relative;
          overflow: hidden;
          animation: fadeInUp 0.5s ease forwards;
          opacity: 0;
        }

        .stat-card:nth-child(1) { animation-delay: 0.1s; }
        .stat-card:nth-child(2) { animation-delay: 0.15s; }
        .stat-card:nth-child(3) { animation-delay: 0.2s; }
        .stat-card:nth-child(4) { animation-delay: 0.25s; }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
          opacity: 0;
          transition: opacity var(--transition-normal);
        }

        .stat-card:hover {
          transform: translateY(-4px);
          border-color: var(--border-hover);
          box-shadow: var(--shadow-lg);
        }

        .stat-card:hover::before {
          opacity: 1;
        }

        .stat-card.success::before {
          background: var(--accent-green);
        }

        .stat-card.warning::before {
          background: var(--accent-yellow);
        }

        .stat-card.error::before {
          background: var(--accent-red);
        }

        .stat-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .stat-icon {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
        }

        .stat-icon svg {
          width: 22px;
          height: 22px;
          color: var(--text-secondary);
        }

        .stat-icon.success {
          background: var(--accent-green-dim);
          border-color: rgba(34, 197, 94, 0.3);
        }

        .stat-icon.success svg {
          color: var(--accent-green);
        }

        .stat-icon.warning {
          background: var(--accent-yellow-dim);
          border-color: rgba(234, 179, 8, 0.3);
        }

        .stat-icon.warning svg {
          color: var(--accent-yellow);
        }

        .stat-icon.error {
          background: var(--accent-red-dim);
          border-color: rgba(239, 68, 68, 0.3);
        }

        .stat-icon.error svg {
          color: var(--accent-red);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 3rem;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .stat-value.success {
          color: var(--accent-green);
        }

        .stat-value.warning {
          color: var(--accent-yellow);
        }

        .stat-value.error {
          color: var(--accent-red);
        }

        .stat-footer {
          margin-top: 12px;
          font-size: 0.8rem;
          color: var(--text-dim);
        }

        /* Section Box */
        .section-box {
          background: var(--bg-secondary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
          margin-bottom: 32px;
          overflow: hidden;
          animation: fadeInUp 0.5s ease forwards;
          animation-delay: 0.3s;
          opacity: 0;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-tertiary);
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .section-title h2 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .section-title .badge {
          padding: 4px 10px;
          background: var(--bg-primary);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .section-actions {
          display: flex;
          gap: 10px;
        }

        /* Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
          text-decoration: none;
          border: none;
        }

        .btn svg {
          width: 18px;
          height: 18px;
        }

        .btn-primary {
          background: var(--accent-blue);
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .btn-secondary {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }

        .btn-ghost {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid transparent;
        }

        .btn-ghost:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .btn-icon {
          width: 36px;
          height: 36px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          background: transparent;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .btn-icon svg {
          width: 18px;
          height: 18px;
        }

        .btn-icon:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* Table */
        .table-wrapper {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          text-align: left;
          padding: 14px 20px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-tertiary);
        }

        td {
          padding: 16px 20px;
          font-size: 0.9rem;
          border-bottom: 1px solid var(--border-color);
          vertical-align: middle;
        }

        tr:last-child td {
          border-bottom: none;
        }

        tr:hover td {
          background: var(--bg-hover);
        }

        .text-right {
          text-align: right;
        }

        .text-center {
          text-align: center;
        }

        .text-dim {
          color: var(--text-dim);
        }

        .text-success {
          color: var(--accent-green);
        }

        .text-warning {
          color: var(--accent-yellow);
        }

        .text-error {
          color: var(--accent-red);
        }

        /* Account ID Cell */
        .account-id {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .avatar {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.9rem;
          color: white;
        }

        code {
          font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 0.85rem;
          color: var(--accent-purple);
          background: var(--bg-primary);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
        }

        .email-cell {
          display: flex;
          flex-direction: column;
        }

        .email-text {
          color: var(--text-primary);
          font-weight: 500;
        }

        .metric-value {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        /* Status Badge */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-icon {
          width: 14px;
          height: 14px;
        }

        .status-ready {
          background: var(--accent-green-dim);
          color: var(--accent-green);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .status-cooldown {
          background: var(--accent-yellow-dim);
          color: var(--accent-yellow);
          border: 1px solid rgba(234, 179, 8, 0.3);
        }

        .status-error {
          background: var(--accent-red-dim);
          color: var(--accent-red);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        /* Quota */
        .quota-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 200px;
        }

        .quota-item {
          display: flex;
          align-items: center;
          font-size: 0.8rem;
        }

        .quota-label {
          width: 120px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 0.75rem;
        }

        .quota-bar-container {
          flex: 1;
          height: 6px;
          background: var(--bg-primary);
          border-radius: 3px;
          overflow: hidden;
          margin: 0 10px;
          border: 1px solid var(--border-color);
        }

        .quota-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.6s ease-out;
        }

        .quota-value {
          width: 40px;
          text-align: right;
          font-family: 'SF Mono', monospace;
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .success-color {
          background: linear-gradient(90deg, var(--accent-green), #34d399);
        }

        .warning-color {
          background: linear-gradient(90deg, var(--accent-yellow), #fbbf24);
        }

        .error-color {
          background: linear-gradient(90deg, var(--accent-red), #f87171);
        }

        /* Empty State */
        .empty-state {
          padding: 60px 40px;
          text-align: center;
        }

        .empty-state-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-color);
        }

        .empty-state-icon svg {
          width: 40px;
          height: 40px;
          color: var(--text-dim);
        }

        .empty-state h3 {
          font-size: 1.1rem;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .empty-state p {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 20px;
        }

        /* SPA Views */
        .spa-view {
          display: none;
        }

        .spa-view.active {
          display: block;
        }

        .spa-frame {
          width: 100%;
          height: calc(100vh - 200px);
          min-height: 600px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          background: #fff;
        }

        /* Footer */
        footer {
          text-align: center;
          padding: 32px 0;
          color: var(--text-dim);
          font-size: 0.85rem;
          border-top: 1px solid var(--border-color);
          margin-top: 40px;
        }

        footer a {
          color: var(--text-secondary);
          text-decoration: none;
          transition: color var(--transition-fast);
        }

        footer a:hover {
          color: var(--accent-blue);
        }

        footer .footer-links {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 12px;
        }

        /* Responsive */
        @media (max-width: 1200px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .container {
            padding: 20px;
          }

          .header {
            flex-direction: column;
            gap: 20px;
          }

          .header-right {
            align-items: flex-start;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .nav-tabs {
            flex-wrap: wrap;
          }

          .stat-value {
            font-size: 2.5rem;
          }
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        ::-webkit-scrollbar-track {
          background: var(--bg-primary);
        }

        ::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: var(--border-hover);
        }

        /* Tag */
        .tag {
          display: inline-flex;
          align-items: center;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          margin-right: 8px;
          margin-bottom: 8px;
          border: 1px solid var(--border-color);
          transition: all var(--transition-fast);
        }

        .tag:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
        }

        /* Refresh animation */
        .btn-refresh.loading svg,
        .btn.loading svg {
          animation: spin 1s linear infinite;
        }

        /* Models Grid */
        .models-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }

        .model-card {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 20px;
          transition: all var(--transition-normal);
          animation: fadeInUp 0.4s ease forwards;
          opacity: 0;
        }

        .model-card:hover {
          transform: translateY(-4px);
          border-color: var(--border-hover);
          box-shadow: var(--shadow-lg);
        }

        .model-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .model-name {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
        }

        .owner-badge {
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border: 1px solid;
        }

        .model-details {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
        }

        .model-detail {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-label {
          font-size: 0.7rem;
          color: var(--text-dim);
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .detail-value {
          font-size: 0.9rem;
          color: var(--text-primary);
          font-weight: 500;
        }

        .model-features {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .feature-tag {
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          background: var(--bg-primary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .feature-tag.thinking {
          background: var(--accent-purple-dim);
          color: var(--accent-purple);
          border-color: rgba(168, 85, 247, 0.3);
        }

        .feature-tag.thinking-only {
          background: var(--accent-yellow-dim);
          color: var(--accent-yellow);
          border-color: rgba(234, 179, 8, 0.3);
        }

        @media (max-width: 768px) {
          .models-grid {
            grid-template-columns: 1fr;
          }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <div class="logo-group">
                    <div class="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                    </div>
                    <div class="logo-text">
                        <h1>Antigravity</h1>
                        <div class="tagline">AI Gateway Proxy</div>
                    </div>
                </div>
                <nav class="nav-tabs">
                    <button onclick="showView('dashboard')" id="nav-dashboard" class="nav-tab active">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                        </svg>
                        Dashboard
                    </button>
                    <button onclick="showView('models')" id="nav-models" class="nav-tab">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                        Models
                    </button>
                    <button onclick="showView('docs')" id="nav-docs" class="nav-tab">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                        API Docs
                    </button>
                </nav>
            </div>
            <div class="header-right">
                <button onclick="toggleTheme()" class="btn-icon theme-toggle" id="theme-toggle" title="Toggle theme">
                    <svg id="icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                    </svg>
                    <svg id="icon-light" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
                    </svg>
                </button>
                <div class="system-status">
                    <div class="status-dot"></div>
                    <span class="status-text">Operational</span>
                </div>
            </div>
        </header>

        <div id="view-dashboard" class="spa-view active">
            <!-- Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                            </svg>
                        </div>
                        <span class="stat-label">Total Accounts</span>
                    </div>
                    <div class="stat-value">${status.totalAccounts}</div>
                    <div class="stat-footer">Configured accounts</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-header">
                        <div class="stat-icon success">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <span class="stat-label">Ready</span>
                    </div>
                    <div class="stat-value success">${status.readyAccounts}</div>
                    <div class="stat-footer">Available for requests</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-header">
                        <div class="stat-icon warning">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <span class="stat-label">Cooldown</span>
                    </div>
                    <div class="stat-value warning">${status.cooldownAccounts}</div>
                    <div class="stat-footer">Rate limited</div>
                </div>
                <div class="stat-card error">
                    <div class="stat-header">
                        <div class="stat-icon error">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                        </div>
                        <span class="stat-label">Errors</span>
                    </div>
                    <div class="stat-value error">${status.errorAccounts}</div>
                    <div class="stat-footer">Needs attention</div>
                </div>
            </div>

            <!-- Accounts Table -->
            <div class="section-box">
                <div class="section-header">
                    <div class="section-title">
                        <h2>Account Rotation</h2>
                        <span class="badge">${status.totalAccounts} accounts</span>
                    </div>
                    <div class="section-actions">
                        <button onclick="refreshQuota()" class="btn btn-secondary" id="btn-refresh">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            Refresh Quota
                        </button>
                        <button onclick="openAuthPopup()" class="btn btn-primary">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                            </svg>
                            Add Account
                        </button>
                    </div>
                </div>
                ${
                  status.totalAccounts === 0
                    ? `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
                        </svg>
                    </div>
                    <h3>No accounts configured</h3>
                    <p>Add your first Google account to start using the proxy.</p>
                    <button onclick="openAuthPopup()" class="btn btn-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                        </svg>
                        Add Your First Account
                    </button>
                </div>
                `
                    : `
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Account ID</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Quota Usage</th>
                                <th class="text-right">Requests</th>
                                <th class="text-right">Errors</th>
                                <th>Last Used</th>
                            </tr>
                        </thead>
                        <tbody id="accounts-tbody">
                            ${accountsRows}
                        </tbody>
                    </table>
                </div>
                `
                }
            </div>

            <!-- Footer -->
            <footer>
                <div>Antigravity v1.0.0 — OpenAI & Anthropic Compatible API Proxy</div>
                <div class="footer-links">
                    <a href="/v1/models">Models</a>
                    <a href="/health">Health</a>
                    <a href="/docs">API Docs</a>
                    <a href="https://github.com/sachnun/antigravity" target="_blank">GitHub</a>
                </div>
            </footer>
        </div>

        <div id="view-models" class="spa-view">
            <div class="section-box" style="animation-delay: 0s; opacity: 1;">
                <div class="section-header">
                    <div class="section-title">
                        <h2>Available Models</h2>
                        <span class="badge">${AVAILABLE_MODELS.length} models</span>
                    </div>
                </div>
                <div style="padding: 24px;">
                    <div class="models-grid">
                        ${AVAILABLE_MODELS.map((model, index) => {
                          const owner = MODEL_OWNERS[model] || 'unknown';
                          const maxTokens = DEFAULT_MAX_TOKENS[model] || 0;
                          const hasThinking = (
                            THINKING_LEVEL_MODELS as readonly string[]
                          ).includes(model);
                          const thinkingOnly = (
                            THINKING_ONLY_MODELS as readonly string[]
                          ).includes(model);

                          const ownerColors: Record<
                            string,
                            { bg: string; border: string; text: string }
                          > = {
                            google: {
                              bg: 'rgba(59, 130, 246, 0.15)',
                              border: 'rgba(59, 130, 246, 0.3)',
                              text: '#3b82f6',
                            },
                            anthropic: {
                              bg: 'rgba(249, 115, 22, 0.15)',
                              border: 'rgba(249, 115, 22, 0.3)',
                              text: '#f97316',
                            },
                            openai: {
                              bg: 'rgba(34, 197, 94, 0.15)',
                              border: 'rgba(34, 197, 94, 0.3)',
                              text: '#22c55e',
                            },
                            unknown: {
                              bg: 'rgba(107, 114, 128, 0.15)',
                              border: 'rgba(107, 114, 128, 0.3)',
                              text: '#6b7280',
                            },
                          };

                          const colors =
                            ownerColors[owner] || ownerColors.unknown;

                          return `
                            <div class="model-card" style="animation-delay: ${index * 0.05}s">
                                <div class="model-header">
                                    <div class="model-name">${model}</div>
                                    <span class="owner-badge" style="background: ${colors.bg}; border-color: ${colors.border}; color: ${colors.text};">
                                        ${owner}
                                    </span>
                                </div>
                                <div class="model-details">
                                    <div class="model-detail">
                                        <span class="detail-label">Max Tokens</span>
                                        <span class="detail-value">${maxTokens.toLocaleString()}</span>
                                    </div>
                                    <div class="model-detail">
                                        <span class="detail-label">Thinking</span>
                                        <span class="detail-value">${thinkingOnly ? 'Required' : hasThinking ? 'Supported' : 'No'}</span>
                                    </div>
                                </div>
                                <div class="model-features">
                                    ${hasThinking ? '<span class="feature-tag thinking">Extended Thinking</span>' : ''}
                                    ${thinkingOnly ? '<span class="feature-tag thinking-only">Thinking Only</span>' : ''}
                                </div>
                            </div>
                          `;
                        }).join('')}
                    </div>
                </div>
            </div>
            
            <!-- Footer -->
            <footer>
                <div>Antigravity v1.0.0 — OpenAI & Anthropic Compatible API Proxy</div>
                <div class="footer-links">
                    <a href="/v1/models">Models API</a>
                    <a href="/health">Health</a>
                    <a href="/docs">API Docs</a>
                    <a href="https://github.com/sachnun/antigravity" target="_blank">GitHub</a>
                </div>
            </footer>
        </div>

        <div id="view-docs" class="spa-view">
            <iframe src="/docs" class="spa-frame"></iframe>
        </div>
    </div>

    <script>
        const AVAILABLE_MODELS = ${JSON.stringify(AVAILABLE_MODELS)};

        // Theme management
        function getStoredTheme() {
            return localStorage.getItem('theme') || 'dark';
        }

        function setTheme(theme) {
            localStorage.setItem('theme', theme);
            if (theme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
                document.getElementById('icon-dark').style.display = 'none';
                document.getElementById('icon-light').style.display = 'block';
            } else {
                document.documentElement.removeAttribute('data-theme');
                document.getElementById('icon-dark').style.display = 'block';
                document.getElementById('icon-light').style.display = 'none';
            }
            // Notify Swagger iframe about theme change
            const iframe = document.querySelector('.spa-frame');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme: theme }, '*');
            }
        }

        window.toggleTheme = function() {
            const currentTheme = getStoredTheme();
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        }

        // Initialize theme on load
        document.addEventListener('DOMContentLoaded', function() {
            setTheme(getStoredTheme());
        });

        // Also set immediately
        (function() {
            const theme = getStoredTheme();
            if (theme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        })();

        window.showView = function(viewId) {
            document.querySelectorAll('.spa-view').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
            
            document.getElementById('view-' + viewId).classList.add('active');
            document.getElementById('nav-' + viewId).classList.add('active');
        };

        window.openAuthPopup = function() {
            const width = 600;
            const height = 700;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            window.open('/oauth/authorize', 'AntigravityLogin', 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
        }

        window.addEventListener('message', (event) => {
            if (event.data.type === 'OAUTH_SUCCESS') {
                refreshQuota();
            }
        });

        function getStatusIcon(status) {
            if (status === 'ready') {
                return '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
            } else if (status === 'cooldown') {
                return '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
            } else {
                return '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
            }
        }

        function getStatusClass(status) {
            return status === 'ready' ? 'status-ready' : status === 'cooldown' ? 'status-cooldown' : 'status-error';
        }

        function renderQuotaHtml(accountQuota) {
            let html = '<div class="quota-container">';
            if (accountQuota) {
                const relevantModels = accountQuota.models.filter(m =>
                    AVAILABLE_MODELS.some(am => am.toLowerCase() === m.modelName.toLowerCase().trim())
                );
                if (relevantModels.length > 0) {
                    html += relevantModels.map(m => {
                        const percentage = Math.round((1 - m.quota) * 100);
                        const colorClass = percentage > 90 ? 'error-color' : percentage > 70 ? 'warning-color' : 'success-color';
                        return '<div class="quota-item"><span class="quota-label">' + m.modelName + '</span><div class="quota-bar-container"><div class="quota-bar ' + colorClass + '" style="width: ' + percentage + '%"></div></div><span class="quota-value">' + percentage + '%</span></div>';
                    }).join('');
                } else {
                    html += '<span class="text-dim">No quota info</span>';
                }
            } else {
                html += '<span class="text-dim">Loading quota...</span>';
            }
            html += '</div>';
            return html;
        }

        function renderAccountRow(acc, quotaStatus, index) {
            const accountQuota = quotaStatus.accounts.find(q => q.accountId === acc.id);
            const statusClass = getStatusClass(acc.status);
            const statusIcon = getStatusIcon(acc.status);
            const quotaHtml = renderQuotaHtml(accountQuota);
            
            return '<tr class="table-row" style="animation-delay: ' + (index * 0.05) + 's">' +
                '<td><code>' + acc.id + '</code></td>' +
                '<td><div class="email-cell"><span class="email-text">' + acc.email + '</span></div></td>' +
                '<td><span class="status-badge ' + statusClass + '">' + statusIcon + acc.status.toUpperCase() + '</span></td>' +
                '<td>' + quotaHtml + '</td>' +
                '<td class="text-right"><span class="metric-value">' + acc.requestCount + '</span></td>' +
                '<td class="text-right"><span class="metric-value ' + (acc.errorCount > 0 ? 'text-error' : '') + '">' + acc.errorCount + '</span></td>' +
                '<td class="text-dim">' + (acc.lastUsed ? new Date(acc.lastUsed).toLocaleTimeString() : '-') + '</td>' +
            '</tr>';
        }

        window.refreshQuota = async function() {
            const btn = document.getElementById('btn-refresh');
            btn.classList.add('loading');
            btn.disabled = true;
            
            try {
                const response = await fetch('/api/quota/refresh');
                const data = await response.json();
                
                // Update stats
                document.querySelectorAll('.stat-value')[0].textContent = data.status.totalAccounts;
                document.querySelectorAll('.stat-value')[1].textContent = data.status.readyAccounts;
                document.querySelectorAll('.stat-value')[2].textContent = data.status.cooldownAccounts;
                document.querySelectorAll('.stat-value')[3].textContent = data.status.errorAccounts;
                
                // Update badge
                document.querySelector('.section-title .badge').textContent = data.status.totalAccounts + ' accounts';
                
                // Update table
                const tbody = document.getElementById('accounts-tbody');
                if (tbody) {
                    tbody.innerHTML = data.status.accounts.map((acc, index) =>
                        renderAccountRow(acc, data.quotaStatus, index)
                    ).join('');
                }
            } catch (error) {
                console.error('Failed to refresh quota:', error);
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    </script>
</body>
</html>
    `;
  }
}
