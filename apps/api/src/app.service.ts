import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'Nutrixx API',
      status: 'ready',
      version: '0.1.0',
    } as const;
  }

  getHealth() {
    return { status: 'ok' } as const;
  }
}
