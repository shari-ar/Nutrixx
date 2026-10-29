import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { agentCurationRunPath } from '@nutrixx/config/application';

interface AgentCurationRunStatus {
  readonly format: 'nutrixx.agent-curation-run';
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly [key: string]: unknown;
}

function isAgentCurationRunStatus(
  input: unknown,
): input is AgentCurationRunStatus {
  if (typeof input !== 'object' || input === null) return false;
  return (
    'format' in input &&
    input.format === 'nutrixx.agent-curation-run' &&
    'schemaVersion' in input &&
    input.schemaVersion === 1 &&
    'runId' in input &&
    typeof input.runId === 'string' &&
    'status' in input &&
    ['queued', 'running', 'completed', 'failed'].includes(String(input.status))
  );
}

function tokensMatch(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function errorCode(error: unknown): string | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    typeof error.code !== 'string'
  )
    return undefined;
  return error.code;
}

@Injectable()
export class AgentCurationService {
  readonly #projectRoot = path.resolve(
    process.env['NUTRIXX_PROJECT_ROOT'] ?? process.cwd(),
  );
  readonly #runsRoot = path.join(
    this.#projectRoot,
    'reference-workbench/agent-curation/runs',
  );
  readonly #expectedToken = this.#initializeToken();

  #initializeToken(): string | undefined {
    const configured = process.env['NUTRIXX_CURATION_TOKEN']?.trim();
    if (configured) return configured;
    const tokenPath = process.env['NUTRIXX_CURATION_TOKEN_FILE'];
    if (!tokenPath || process.env['NUTRIXX_CURATION_ENABLED'] !== 'true')
      return undefined;
    mkdirSync(path.dirname(tokenPath), { recursive: true });
    try {
      const existing = readFileSync(tokenPath, 'utf8').trim();
      if (existing.length >= 32) return existing;
      throw new TypeError('The local curation token file is invalid.');
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    const generated = randomBytes(32).toString('base64url');
    try {
      writeFileSync(tokenPath, generated, { flag: 'wx', mode: 0o600 });
      return generated;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const existing = readFileSync(tokenPath, 'utf8').trim();
      if (existing.length < 32)
        throw new TypeError('The local curation token file is invalid.', {
          cause: error,
        });
      return existing;
    }
  }

  #authorize(authorization: string | undefined): void {
    if (process.env['NUTRIXX_CURATION_ENABLED'] !== 'true')
      throw new ServiceUnavailableException(
        'The local curation API is disabled.',
      );
    const expected =
      process.env['NUTRIXX_CURATION_TOKEN']?.trim() || this.#expectedToken;
    if (!expected)
      throw new ServiceUnavailableException(
        'The local curation API token is not configured.',
      );
    const prefix = 'Bearer ';
    const received = authorization?.startsWith(prefix)
      ? authorization.slice(prefix.length)
      : '';
    if (!tokensMatch(received, expected))
      throw new UnauthorizedException('The curation token is invalid.');
  }

  async #atomicJson(filename: string, value: unknown): Promise<void> {
    const temporary = `${filename}.${process.pid}.next`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, filename);
  }

  public async createRun(
    input: unknown,
    authorization: string | undefined,
  ): Promise<AgentCurationRunStatus & { readonly statusUrl: string }> {
    this.#authorize(authorization);
    const processor = path.join(
      this.#projectRoot,
      'scripts/process-agent-curation.mjs',
    );
    if (!existsSync(processor))
      throw new ServiceUnavailableException(
        'The local curation processor is unavailable.',
      );
    const runId = randomUUID();
    const runDirectory = path.join(this.#runsRoot, runId);
    await mkdir(runDirectory, { recursive: true });
    const queued = {
      format: 'nutrixx.agent-curation-run',
      schemaVersion: 1,
      runId,
      status: 'queued',
      queuedAt: new Date().toISOString(),
    } as const;
    await Promise.all([
      this.#atomicJson(path.join(runDirectory, 'input.json'), input),
      this.#atomicJson(path.join(runDirectory, 'status.json'), queued),
    ]);

    const logDescriptor = openSync(path.join(runDirectory, 'run.log'), 'a');
    const npmExecPath = process.env['npm_execpath'];
    const executable = npmExecPath ? process.execPath : 'npm';
    const commandArguments = [
      ...(npmExecPath ? [npmExecPath] : []),
      'run',
      'reference:agent:process',
      '--',
      '--run-id',
      runId,
    ];
    const child = spawn(executable, commandArguments, {
      cwd: this.#projectRoot,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logDescriptor, logDescriptor],
    });
    child.once('error', (error) => {
      const statusPath = path.join(runDirectory, 'status.json');
      const temporary = `${statusPath}.${process.pid}.next`;
      try {
        writeFileSync(
          temporary,
          `${JSON.stringify(
            {
              ...queued,
              status: 'failed',
              failedAt: new Date().toISOString(),
              error: error.message,
            },
            null,
            2,
          )}\n`,
        );
        renameSync(temporary, statusPath);
      } catch {
        // The API still returns the queued status; run.log retains spawn errors.
      }
    });
    child.once('exit', (code) => {
      if (code === 0) return;
      const statusPath = path.join(runDirectory, 'status.json');
      try {
        const current: unknown = JSON.parse(readFileSync(statusPath, 'utf8'));
        if (
          isAgentCurationRunStatus(current) &&
          ['completed', 'failed'].includes(current.status)
        )
          return;
        const temporary = `${statusPath}.${process.pid}.next`;
        writeFileSync(
          temporary,
          `${JSON.stringify(
            {
              ...queued,
              status: 'failed',
              failedAt: new Date().toISOString(),
              error: `The curation worker exited with code ${String(code)}.`,
            },
            null,
            2,
          )}\n`,
        );
        renameSync(temporary, statusPath);
      } catch {
        // The worker log remains available for startup diagnostics.
      }
    });
    child.unref();
    closeSync(logDescriptor);
    return {
      ...queued,
      statusUrl: agentCurationRunPath(runId),
    };
  }

  public async getRun(
    runId: string,
    authorization: string | undefined,
  ): Promise<AgentCurationRunStatus> {
    this.#authorize(authorization);
    if (!/^[a-f0-9-]{36}$/u.test(runId))
      throw new NotFoundException('The curation run is unavailable.');
    try {
      const parsed: unknown = JSON.parse(
        await readFile(path.join(this.#runsRoot, runId, 'status.json'), 'utf8'),
      );
      if (!isAgentCurationRunStatus(parsed))
        throw new TypeError('The persisted curation run is invalid.');
      return parsed;
    } catch {
      throw new NotFoundException('The curation run is unavailable.');
    }
  }
}
