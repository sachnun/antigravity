import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const apiKey = this.configService.get<string>('proxyApiKey');

    // Se não há API key configurada, acesso é livre
    if (!apiKey) {
      return true;
    }

    // Verificar cookie de sessão
    const sessionToken = request.cookies?.['antigravity_session'];
    if (sessionToken && this.validateSession(sessionToken, apiKey)) {
      return true;
    }

    // Redirecionar para login se não autenticado
    const isApiRoute = request.path.startsWith('/api/');
    if (isApiRoute) {
      throw new UnauthorizedException('Authentication required');
    }

    // Para rotas de página, redirecionar para login
    response.redirect('/login');
    return false;
  }

  private validateSession(token: string, apiKey: string): boolean {
    // Token simples: hash do apiKey
    const expectedToken = this.generateSessionToken(apiKey);
    return token === expectedToken;
  }

  generateSessionToken(apiKey: string): string {
    // Gerar um token simples baseado no apiKey
    // Em produção, usar algo mais seguro como JWT
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
