import {
  Controller,
  Get,
  Post,
  Header,
  Req,
  Res,
  Body,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import crypto from 'crypto';
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
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  private isAuthenticated(req: Request): boolean {
    const apiKey = this.configService.get<string>('proxyApiKey');

    // Se não há API key configurada, acesso é livre
    if (!apiKey) {
      return true;
    }

    // Verificar cookie de sessão
    const cookies = req.cookies as Record<string, string> | undefined;
    const sessionToken = cookies?.['antigravity_session'];
    if (sessionToken) {
      const expectedToken = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');
      return sessionToken === expectedToken;
    }

    return false;
  }

  private requiresAuth(): boolean {
    const apiKey = this.configService.get<string>('proxyApiKey');
    return !!apiKey;
  }

  @Get('login')
  @Header('Content-Type', 'text/html')
  getLoginPage(@Req() req: Request, @Res() res: Response): void {
    // Se não requer auth ou já está autenticado, redirecionar para dashboard
    if (!this.requiresAuth() || this.isAuthenticated(req)) {
      res.redirect('/');
      return;
    }

    const query = req.query as Record<string, string>;
    res.send(this.appService.getLoginPage(query['error']));
  }

  @Post('login')
  @HttpCode(200)
  doLogin(
    @Body() body: { password?: string },
    @Res({ passthrough: true }) res: Response,
  ): { success: boolean; error?: string } {
    const apiKey = this.configService.get<string>('proxyApiKey');

    // Se não há API key configurada, sucesso automático
    if (!apiKey) {
      return { success: true };
    }

    if (body.password === apiKey) {
      const sessionToken = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');
      res.cookie('antigravity_session', sessionToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
        sameSite: 'lax',
      });
      return { success: true };
    }

    return { success: false, error: 'Invalid password' };
  }

  @Get('logout')
  doLogout(@Res() res: Response): void {
    res.clearCookie('antigravity_session');
    res.redirect('/login');
  }

  @Get()
  @Header('Content-Type', 'text/html')
  async getDashboard(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Verificar autenticação
    if (!this.isAuthenticated(req)) {
      res.redirect('/login');
      return;
    }

    const status = this.accountsService.getStatus(this.isAuthenticated(req));
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();

    // Se for a primeira vez carregando a página, faz o refresh automático
    if (!this.initialRefreshDone && status.totalAccounts > 0) {
      this.initialRefreshDone = true;
      const quotaStatus = await this.antigravityService.getQuotaStatus();
      res.send(
        this.appService.getDashboard(status, quotaStatus, this.requiresAuth()),
      );
      return;
    }

    // Nas vezes seguintes, usa o cache para performance
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    res.send(
      this.appService.getDashboard(status, quotaStatus, this.requiresAuth()),
    );
  }

  @Get('api/dashboard')
  async getDashboardData(@Req() req: Request) {
    if (!this.isAuthenticated(req)) {
      throw new UnauthorizedException('Authentication required');
    }
    const status = this.accountsService.getStatus(this.isAuthenticated(req));
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return { status, quotaStatus };
  }

  @Get('api/quota/refresh')
  async refreshQuotaApi(@Req() req: Request) {
    if (!this.isAuthenticated(req)) {
      throw new UnauthorizedException('Authentication required');
    }
    await this.antigravityService.getQuotaStatus();
    const status = this.accountsService.getStatus(this.isAuthenticated(req));
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return { status, quotaStatus };
  }
}
