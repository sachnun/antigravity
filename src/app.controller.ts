import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { AccountsService } from './accounts/accounts.service';
import { AntigravityService } from './antigravity/antigravity.service';
import { QuotaService } from './quota/quota.service';

@Controller()
export class AppController {
  private initialRefreshDone = false;

  constructor(
    private readonly appService: AppService,
    private readonly accountsService: AccountsService,
    private readonly antigravityService: AntigravityService,
    private readonly quotaService: QuotaService,
  ) {}

  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get()
  @Header('Content-Type', 'text/html')
  async getDashboard(): Promise<string> {
    const status = this.accountsService.getStatus();
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();

    // Se for a primeira vez carregando a página, faz o refresh automático
    if (!this.initialRefreshDone && status.totalAccounts > 0) {
      this.initialRefreshDone = true;
      const quotaStatus = await this.antigravityService.getQuotaStatus();
      return this.appService.getDashboard(status, quotaStatus);
    }

    // Nas vezes seguintes, usa o cache para performance
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return this.appService.getDashboard(status, quotaStatus);
  }

  @Get('api/dashboard')
  async getDashboardData() {
    const status = this.accountsService.getStatus();
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return { status, quotaStatus };
  }

  @Get('api/quota/refresh')
  async refreshQuotaApi() {
    await this.antigravityService.getQuotaStatus();
    const status = this.accountsService.getStatus();
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return { status, quotaStatus };
  }
}
