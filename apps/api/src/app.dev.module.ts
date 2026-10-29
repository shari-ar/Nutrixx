import { Module } from '@nestjs/common';

import { AgentCurationController } from './agent-curation.controller.js';
import { AgentCurationService } from './agent-curation.service.js';
import { AppModule } from './app.module.js';

/** Development-only operator capabilities excluded from the production entrypoint. */
@Module({
  imports: [AppModule],
  controllers: [AgentCurationController],
  providers: [AgentCurationService],
})
export class DevAppModule {}
