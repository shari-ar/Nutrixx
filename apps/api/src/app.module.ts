import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AgentCurationController } from './agent-curation.controller.js';
import { AgentCurationService } from './agent-curation.service.js';

@Module({
  imports: [],
  controllers: [AppController, AgentCurationController],
  providers: [AppService, AgentCurationService],
})
export class AppModule {}
