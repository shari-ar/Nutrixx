import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputDirectory = path.join(workspace, '.temp/data-quality-radar');
const statusPath = path.join(outputDirectory, 'startup-status.json');
const healthUrl = 'http://127.0.0.1:3002/_health';

async function writeStatus(state, message) {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    statusPath,
    `${JSON.stringify({ state, message, updatedAt: new Date().toISOString() })}\n`,
  );
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspace,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let errorTail = '';
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      errorTail = (errorTail + String(chunk)).slice(-500);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with ${code}. ${errorTail.trim()}`,
          ),
        );
    });
  });
}

async function serverIsReady() {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok && (await response.text()) === 'nutrixx-radar-v1';
  } catch {
    return false;
  }
}

async function startServer() {
  if (await serverIsReady()) return;
  const child = spawn(
    process.execPath,
    ['.devcontainer/serve-data-quality-radar.mjs'],
    { cwd: workspace, detached: true, stdio: 'ignore' },
  );
  child.unref();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await serverIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The data quality radar server did not start on port 3002.');
}

await writeStatus('preparing', 'The local food catalog is being prepared.');
try {
  await run(process.execPath, ['.devcontainer/prepare-local-catalog.mjs']);
  await run('npm', ['run', 'quality:data']);
  const generatedReport = JSON.parse(
    await readFile(path.join(outputDirectory, 'report.json'), 'utf8'),
  );
  if (
    generatedReport.artifact?.receiptStatus !==
    'verified against local release receipt'
  ) {
    throw new Error('The local catalog receipt is missing or unverified.');
  }
  await writeStatus('ready', 'The data quality radar is ready.');
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown startup error';
  await writeStatus('failed', message);
  console.warn(`Data quality radar preparation failed: ${message}`);
}
await startServer();
console.info('Data quality radar: http://localhost:3002/');
