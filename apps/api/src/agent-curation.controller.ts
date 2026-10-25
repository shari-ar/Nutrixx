import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { AgentCurationService } from './agent-curation.service.js';

@Controller('internal/curation/runs')
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
