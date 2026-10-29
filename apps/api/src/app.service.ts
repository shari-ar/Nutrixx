import { Injectable } from '@nestjs/common';
import {
  API_CONTRACT_VERSION,
  API_SERVICE_NAME,
} from '@nutrixx/config/application';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: API_SERVICE_NAME,
      status: 'ready',
      version: API_CONTRACT_VERSION,
    } as const;
  }

  getHealth() {
    return { status: 'ok' } as const;
  }
}
