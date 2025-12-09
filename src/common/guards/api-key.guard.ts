import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const isAnthropicEndpoint = request.path === '/v1/messages';

    const token = isAnthropicEndpoint
      ? this.extractAnthropicKey(request)
      : this.extractOpenAIKey(request);

    const apiKey = this.configService.get<string>('proxyApiKey');

    if (!apiKey) {
      return true;
    }

    if (token !== apiKey) {
      const maskedKey =
        token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '****';

      if (isAnthropicEndpoint) {
        throw new HttpException(
          {
            type: 'error',
            error: {
              type: 'authentication_error',
              message: `Invalid API key provided: ${maskedKey}`,
            },
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new HttpException(
        {
          error: {
            message: `Incorrect API key provided: ${maskedKey}. You can find your API key in your settings.`,
            type: 'authentication_error',
            param: null,
            code: 'invalid_api_key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }

  private extractAnthropicKey(request: Request): string {
    const xApiKey = request.headers['x-api-key'];

    if (!xApiKey || typeof xApiKey !== 'string') {
      throw new HttpException(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Missing required header: x-api-key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return xApiKey;
  }

  private extractOpenAIKey(request: Request): string {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new HttpException(
        {
          error: {
            message:
              "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY).",
            type: 'authentication_error',
            param: null,
            code: 'invalid_api_key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new HttpException(
        {
          error: {
            message:
              'Invalid Authorization header format. Expected: Bearer YOUR_KEY',
            type: 'authentication_error',
            param: null,
            code: 'invalid_api_key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return token;
  }
}
