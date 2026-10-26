import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentCurationService } from './agent-curation.service.js';

const environmentKeys = [
  'NUTRIXX_CURATION_ENABLED',
  'NUTRIXX_CURATION_TOKEN',
  'NUTRIXX_CURATION_TOKEN_FILE',
  'NUTRIXX_PROJECT_ROOT',
] as const;

describe('AgentCurationService local token', () => {
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    for (const key of environmentKeys) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('creates and accepts a workspace-local high-entropy token', async () => {
    const projectRoot = await mkdtemp(
      path.join(tmpdir(), 'nutrixx-curation-token-'),
    );
    temporaryDirectories.push(projectRoot);
    const tokenPath = path.join(projectRoot, '.temp/local-curation-token');
    process.env['NUTRIXX_CURATION_ENABLED'] = 'true';
    delete process.env['NUTRIXX_CURATION_TOKEN'];
    process.env['NUTRIXX_CURATION_TOKEN_FILE'] = tokenPath;
    process.env['NUTRIXX_PROJECT_ROOT'] = projectRoot;

    const service = new AgentCurationService();
    const token = await readFile(tokenPath, 'utf8');

    expect(token).toHaveLength(43);
    await expect(
      service.getRun('00000000-0000-0000-0000-000000000000', undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.getRun('00000000-0000-0000-0000-000000000000', `Bearer ${token}`),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
