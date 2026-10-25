import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const runId = process.argv[process.argv.indexOf('--run-id') + 1];
if (!/^[a-f0-9-]{36}$/u.test(runId ?? ''))
  throw new TypeError('The curation run identifier is invalid.');

const workbenchRoot = path.join(
  projectRoot,
  'reference-workbench/agent-curation',
);
const lockPath = path.join(workbenchRoot, '.build-lock');
const statusPath = path.join(workbenchRoot, 'runs', runId, 'status.json');

async function atomicStatus(value) {
  const temporary = `${statusPath}.${process.pid}.next`;
  await writeFile(
    temporary,
    `${JSON.stringify(
      {
        format: 'nutrixx.agent-curation-run',
        schemaVersion: 1,
        runId,
        ...value,
      },
      null,
      2,
    )}\n`,
  );
  await rename(temporary, statusPath);
}

async function acquireLock() {
  await mkdir(workbenchRoot, { recursive: true });
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    try {
      await mkdir(lockPath);
      await writeFile(
        path.join(lockPath, 'owner.json'),
        `${JSON.stringify({ runId, processId: process.pid })}\n`,
      );
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const lockAge = Date.now() - (await stat(lockPath)).mtimeMs;
      if (lockAge > 60 * 60 * 1000) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      await atomicStatus({
        status: 'queued',
        phase: 'waiting-for-catalog-build-lock',
      });
      await delay(500);
    }
  }
  throw new Error('The catalog build queue wait limit was reached.');
}

function buildPackages() {
  const npmExecPath = process.env['npm_execpath'];
  const result = npmExecPath
    ? spawnSync(
        process.execPath,
        [npmExecPath, 'run', 'reference:agent:build'],
        {
          cwd: projectRoot,
          stdio: 'inherit',
        },
      )
    : spawnSync('npm', ['run', 'reference:agent:build'], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `The curation dependency build exited with code ${String(result.status)}.`,
    );
}

await acquireLock();
try {
  await atomicStatus({
    status: 'running',
    phase: 'building-curation-dependencies',
    startedAt: new Date().toISOString(),
  });
  buildPackages();
  const { processAgentCurationRunV1 } = await import(
    './process-agent-curation.mjs'
  );
  await processAgentCurationRunV1({ runId });
} catch (error) {
  let current;
  try {
    current = JSON.parse(await readFile(statusPath, 'utf8'));
  } catch {
    current = null;
  }
  if (current?.status !== 'failed')
    await atomicStatus({
      status: 'failed',
      failedAt: new Date().toISOString(),
      error:
        error instanceof Error ? error.message : 'Unknown curation failure.',
    });
  throw error;
} finally {
  await rm(lockPath, { recursive: true, force: true });
}
