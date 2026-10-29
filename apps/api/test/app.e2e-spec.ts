import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { parseApiEnvironment } from '@nutrixx/config/environment';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from './../src/app.config.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, parseApiEnvironment({ NODE_ENV: 'test' }));
    await app.init();
  });

  it('/api/v1 (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: 'Nutrixx API',
      status: 'ready',
      version: '0.1.0',
    });
  });

  it('/api/v1/health (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not expose development curation routes', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/internal/curation/runs')
      .send({});

    expect(response.status).toBe(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
