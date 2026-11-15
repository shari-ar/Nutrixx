import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const solverRequire = createRequire(
  new URL('../packages/solver-highs/package.json', import.meta.url),
);
const source = solverRequire.resolve('highs/runtime');
const destinationDirectory = path.join(
  projectRoot,
  'apps',
  'web',
  'public',
  'solver-assets',
);
const destination = path.join(destinationDirectory, 'highs.wasm');

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
console.log('Prepared pinned HiGHS WebAssembly asset.');
