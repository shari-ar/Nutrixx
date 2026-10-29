import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { parseApiEnvironment } from '@nutrixx/config/environment';

import { configureApp } from './app.config.js';

export async function bootstrap(rootModule: Type<unknown>): Promise<void> {
  const rootEnvFile = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ].find((path) => existsSync(path));

  if (rootEnvFile) process.loadEnvFile(rootEnvFile);

  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create<NestExpressApplication>(rootModule);

  app.useBodyParser('json', { limit: '10mb' });
  configureApp(app, environment);

  await app.listen(environment.API_PORT, environment.API_HOST);
}
