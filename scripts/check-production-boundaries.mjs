import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webBuild = path.join(root, 'apps/web/.next');
const apiBundle = path.join(root, 'apps/api/dist/main.js');

const forbiddenWebMarkers = [
  '/acceptance/catalog',
  'Stage 4 browser acceptance',
  'Using Local Draft',
  'nutrixx.local-food-catalog-draft',
  'NEXT_PUBLIC_STAGE4_ACCEPTANCE_ENABLED',
];
const forbiddenApiMarkers = [
  'internal/curation',
  'NUTRIXX_CURATION',
  'nutrixx.agent-curation-run',
  'reference-workbench/agent-curation',
];

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectJavaScriptFiles(target);
      return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    }),
  );
  return nested.flat();
}

async function assertMarkersAbsent(files, markers, label) {
  const violations = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const marker of markers) {
      if (content.includes(marker))
        violations.push(`${path.relative(root, file)} contains ${marker}`);
    }
  }
  if (violations.length > 0)
    throw new TypeError(
      `${label} contains development/operator code:\n${violations.join('\n')}`,
    );
}

const manifestPath = path.join(webBuild, 'server/app-paths-manifest.json');
const routes = JSON.parse(await readFile(manifestPath, 'utf8'));
const operatorRoutes = Object.keys(routes).filter((route) =>
  route.startsWith('/acceptance'),
);
if (operatorRoutes.length > 0)
  throw new TypeError(
    `Production Web exposes development routes: ${operatorRoutes.join(', ')}`,
  );

const webFiles = await collectJavaScriptFiles(path.join(webBuild, 'server'));
webFiles.push(...(await collectJavaScriptFiles(path.join(webBuild, 'static'))));
await assertMarkersAbsent(webFiles, forbiddenWebMarkers, 'Production Web');
await assertMarkersAbsent([apiBundle], forbiddenApiMarkers, 'Production API');

console.log('Production Web and API boundaries: valid');
