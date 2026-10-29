import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { AGENT_CURATION_RUNS_ROUTE } from '@nutrixx/config/application';

import { AgentCurationService } from './agent-curation.service.js';

@Controller(AGENT_CURATION_RUNS_ROUTE)
export class AgentCurationController {
  public constructor(private readonly curation: AgentCurationService) {}

  @Post()
  @HttpCode(202)
  public createRun(
    @Body() input: unknown,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.curation.createRun(input, authorization);
  }

  @Get(':runId')
  public getRun(
    @Param('runId') runId: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.curation.getRun(runId, authorization);
  }
}
