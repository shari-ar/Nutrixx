import { spawnSync } from 'node:child_process';

const [nodeEnvironment, executable, ...args] = process.argv.slice(2);
const supportedEnvironments = new Set(['development', 'production', 'test']);

if (!supportedEnvironments.has(nodeEnvironment) || !executable) {
  console.error(
    'Usage: node scripts/run-with-node-env.mjs <development|production|test> <command> [...args]',
  );
  process.exit(64);
}

const result = spawnSync(executable, args, {
  env: { ...process.env, NODE_ENV: nodeEnvironment },
  shell: process.platform === 'win32',
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(`Unable to start ${executable}: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`${executable} terminated by signal ${result.signal}.`);
  process.exit(1);
}

process.exit(result.status ?? 1);
