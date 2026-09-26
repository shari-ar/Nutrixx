import type { INestApplication } from '@nestjs/common';
import type { ApiEnvironment } from '@nutrixx/config/environment';

export const API_PREFIX = 'api/v1';

export function configureApp(
  app: INestApplication,
  environment: Pick<ApiEnvironment, 'WEB_ORIGIN'>,
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: environment.WEB_ORIGIN,
  });
}
