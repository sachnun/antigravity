import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface HealthResponse {
  status: string;
  timestamp: string;
}

interface ModelResponse {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface ModelsListResponse {
  object: string;
  data: ModelResponse[];
}

interface OAuthStatusResponse {
  authUrl: string;
  callbackUrl: string;
  instructions: string;
}

interface ErrorResponse {
  message: string;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthResponse;
        expect(body.status).toBe('ok');
        expect(body.timestamp).toBeDefined();
      });
  });
});

describe('AntigravityController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /v1/models', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer()).get('/v1/models').expect(401);
    });

    it('should return models list with valid API key', () => {
      return request(app.getHttpServer())
        .get('/v1/models')
        .set('Authorization', 'Bearer test-api-key')
        .expect(200)
        .expect((res) => {
          const body = res.body as ModelsListResponse;
          expect(body).toHaveProperty('object', 'list');
          expect(body).toHaveProperty('data');
          expect(Array.isArray(body.data)).toBe(true);
          expect(body.data.length).toBeGreaterThan(0);
          expect(body.data[0]).toHaveProperty('id');
          expect(body.data[0]).toHaveProperty('object', 'model');
          expect(body.data[0]).toHaveProperty('created');
          expect(body.data[0]).toHaveProperty('owned_by');
        });
    });
  });

  describe('POST /v1/chat/completions', () => {
    it('should return 401 without API key', () => {
      return request(app.getHttpServer())
        .post('/v1/chat/completions')
        .send({
          model: 'gemini-2.0-flash',
          messages: [{ role: 'user', content: 'Hello' }],
        })
        .expect(401);
    });

    it('should return 500 for invalid request body (missing messages)', () => {
      return request(app.getHttpServer())
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key')
        .send({})
        .expect(500);
    });

    it('should return 503 when credentials not configured', () => {
      return request(app.getHttpServer())
        .post('/v1/chat/completions')
        .set('Authorization', 'Bearer test-api-key')
        .send({
          model: 'gemini-2.0-flash',
          messages: [{ role: 'user', content: 'Hello' }],
        })
        .expect((res) => {
          expect([503, 404]).toContain(res.status);
        });
    });
  });
});

describe('OAuthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /oauth/status', () => {
    it('should return OAuth status', () => {
      return request(app.getHttpServer())
        .get('/oauth/status')
        .expect(200)
        .expect((res) => {
          const body = res.body as OAuthStatusResponse;
          expect(body).toHaveProperty('authUrl');
          expect(body).toHaveProperty('callbackUrl');
          expect(body).toHaveProperty('instructions');
          expect(body.authUrl).toContain('accounts.google.com');
          expect(body.callbackUrl).toContain('/oauth/callback');
        });
    });
  });

  describe('GET /oauth/authorize', () => {
    it('should redirect to Google OAuth', () => {
      return request(app.getHttpServer())
        .get('/oauth/authorize')
        .expect(302)
        .expect((res) => {
          expect(res.headers.location).toContain('accounts.google.com');
          expect(res.headers.location).toContain('client_id');
          expect(res.headers.location).toContain('redirect_uri');
          expect(res.headers.location).toContain('scope');
        });
    });
  });

  describe('GET /oauth/callback', () => {
    it('should return 400 when code is missing', () => {
      return request(app.getHttpServer())
        .get('/oauth/callback')
        .expect(400)
        .expect((res) => {
          const body = res.body as ErrorResponse;
          expect(body.message).toBe('Missing authorization code');
        });
    });

    it('should show error page when error param is present', () => {
      return request(app.getHttpServer())
        .get('/oauth/callback?error=access_denied')
        .expect(400)
        .expect((res) => {
          expect(res.text).toContain('Authentication Failed');
          expect(res.text).toContain('access_denied');
        });
    });
  });
});
