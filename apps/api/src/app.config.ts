import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@nutrixx/config/application';
import type { ApiEnvironment } from '@nutrixx/config/environment';

export function configureApp(
  app: INestApplication,
  environment: Pick<ApiEnvironment, 'WEB_ORIGIN'>,
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: environment.WEB_ORIGIN,
  });
}
