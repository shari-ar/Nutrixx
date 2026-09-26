import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should identify the Nutrixx API', () => {
      expect(appController.getInfo()).toEqual({
        name: 'Nutrixx API',
        status: 'ready',
        version: '0.1.0',
      });
    });
  });

  describe('health', () => {
    it('should report a healthy service', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });
  });
});
