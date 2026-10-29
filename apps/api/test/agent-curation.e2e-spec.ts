import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { parseApiEnvironment } from '@nutrixx/config/environment';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configureApp } from './../src/app.config.js';
import { DevAppModule } from './../src/app.dev.module.js';

describe('Agent curation development API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DevAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, parseApiEnvironment({ NODE_ENV: 'test' }));
    await app.init();
  });

  it('rejects run creation while local curation is disabled', async () => {
    const previous = process.env['NUTRIXX_CURATION_ENABLED'];
    delete process.env['NUTRIXX_CURATION_ENABLED'];
    try {
      const response = await request(app.getHttpServer())
        .post('/api/v1/internal/curation/runs')
        .send({});

      expect(response.status).toBe(503);
    } finally {
      if (previous === undefined)
        delete process.env['NUTRIXX_CURATION_ENABLED'];
      else process.env['NUTRIXX_CURATION_ENABLED'] = previous;
    }
  });

  it('protects persisted run status', async () => {
    const previousEnabled = process.env['NUTRIXX_CURATION_ENABLED'];
    const previousToken = process.env['NUTRIXX_CURATION_TOKEN'];
    process.env['NUTRIXX_CURATION_ENABLED'] = 'true';
    process.env['NUTRIXX_CURATION_TOKEN'] = 'test-token';
    try {
      const unauthorized = await request(app.getHttpServer()).get(
        '/api/v1/internal/curation/runs/00000000-0000-0000-0000-000000000000',
      );
      const unavailable = await request(app.getHttpServer())
        .get(
          '/api/v1/internal/curation/runs/00000000-0000-0000-0000-000000000000',
        )
        .set('Authorization', 'Bearer test-token');

      expect(unauthorized.status).toBe(401);
      expect(unavailable.status).toBe(404);
    } finally {
      if (previousEnabled === undefined)
        delete process.env['NUTRIXX_CURATION_ENABLED'];
      else process.env['NUTRIXX_CURATION_ENABLED'] = previousEnabled;
      if (previousToken === undefined)
        delete process.env['NUTRIXX_CURATION_TOKEN'];
      else process.env['NUTRIXX_CURATION_TOKEN'] = previousToken;
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
