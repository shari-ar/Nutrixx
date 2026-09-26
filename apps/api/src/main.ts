import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { parseApiEnvironment } from '@nutrixx/config/environment';

import { configureApp } from './app.config.js';
import { AppModule } from './app.module.js';

const rootEnvFile = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
].find((path) => existsSync(path));

if (rootEnvFile) {
  process.loadEnvFile(rootEnvFile);
}

const environment = parseApiEnvironment(process.env);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app, environment);

  await app.listen(environment.API_PORT, environment.API_HOST);
}
await bootstrap();
