import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const excludedDirectoryNames = new Set([
  '.cache',
  '.git',
  '.next',
  '.temp',
  '.terraform',
  '.tmp',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'logs',
  'node_modules',
  'out',
]);

const missingReadmes = [];

async function hasReadme(directory) {
  try {
    await access(path.join(directory, 'README.md'), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function inspectDirectory(directory) {
  if (!(await hasReadme(directory))) {
    missingReadmes.push(path.relative(repositoryRoot, directory) || '.');
  }

  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          !excludedDirectoryNames.has(entry.name),
      )
      .map((entry) => inspectDirectory(path.join(directory, entry.name))),
  );
}

await inspectDirectory(repositoryRoot);

if (missingReadmes.length > 0) {
  missingReadmes.sort((left, right) => left.localeCompare(right, 'en'));
  console.error('Every project-owned directory must contain README.md:');
  for (const directory of missingReadmes) {
    console.error(`- ${directory}`);
  }
  process.exitCode = 1;
} else {
  console.log('Directory README policy: valid');
}
