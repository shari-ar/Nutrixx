import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function npmRun(script, workspace) {
  run(
    npm,
    workspace === undefined
      ? ['run', script]
      : ['run', script, `--workspace=${workspace}`],
  );
}

const suppliedChangedFiles = process.env.NUTRIXX_CHANGED_FILES;
const upstream =
  suppliedChangedFiles === undefined
    ? output('git', ['rev-parse', '--verify', '@{u}'])
    : null;
const base =
  suppliedChangedFiles === undefined
    ? (upstream ?? output('git', ['rev-parse', '--verify', 'HEAD^']))
    : null;
if (suppliedChangedFiles === undefined && base === null) {
  npmRun('check');
  process.exit(0);
}

const changed = (
  suppliedChangedFiles ??
  output('git', [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    `${base}..HEAD`,
  ]) ??
  ''
)
  .split(/\r?\n/u)
  .filter(Boolean);
if (changed.length === 0) process.exit(0);

const fullGatePatterns = [
  /^\.devcontainer\//u,
  /^\.github\//u,
  /^\.husky\//u,
  /^infra\//u,
  /^scripts\//u,
  /^packages\/config\//u,
  /(^|\/)package(?:-lock)?\.json$/u,
  /(^|\/)tsconfig[^/]*\.json$/u,
  /(^|\/)vitest\.config/u,
];
if (
  changed.some((file) => fullGatePatterns.some((pattern) => pattern.test(file)))
) {
  console.log(
    'High-impact platform change detected; running the complete gate.',
  );
  npmRun('check');
  process.exit(0);
}

const existing = changed.filter((file) => existsSync(path.join(root, file)));
if (existing.length > 0)
  run(npm, [
    'exec',
    'prettier',
    '--',
    '--check',
    '--ignore-unknown',
    ...existing,
  ]);

npmRun('config:check');
npmRun('quality:code');
npmRun('production:boundary:check');

if (changed.some((file) => file.endsWith('.md'))) npmRun('docs:check');
if (changed.some((file) => file.startsWith('docs/'))) npmRun('docs:build');

const packageDirectories = new Set(
  changed.flatMap((file) => {
    const match = /^packages\/([^/]+)\//u.exec(file);
    return match?.[1] ? [match[1]] : [];
  }),
);
for (const directory of packageDirectories) {
  const packageFile = path.join(root, 'packages', directory, 'package.json');
  const manifest = JSON.parse(readFileSync(packageFile, 'utf8'));
  for (const script of ['build', 'lint', 'test'])
    if (manifest.scripts?.[script]) npmRun(script, manifest.name);
}

const webFiles = changed
  .filter((file) => file.startsWith('apps/web/'))
  .map((file) => file.slice('apps/web/'.length))
  .filter((file) => /\.(?:c|m)?(?:j|t)sx?$/u.test(file));
if (webFiles.length > 0) {
  run(
    npm,
    ['exec', 'eslint', '--', '--max-warnings=0', ...webFiles],
    path.join(root, 'apps', 'web'),
  );
  npmRun('typecheck', '@nutrixx/web');
  npmRun('test', '@nutrixx/web');
}

const apiChanged = changed.some((file) => file.startsWith('apps/api/'));
if (apiChanged) {
  npmRun('lint', '@nutrixx/api');
  npmRun('typecheck', '@nutrixx/api');
  npmRun('test', '@nutrixx/api');
  npmRun('test:e2e', '@nutrixx/api');
}

if (packageDirectories.size > 0 && webFiles.length === 0) {
  npmRun('typecheck', '@nutrixx/web');
  npmRun('test', '@nutrixx/web');
}

console.log('Change-scoped pre-push gate: valid');
