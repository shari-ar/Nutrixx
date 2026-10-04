import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const docsRoot = path.join(repositoryRoot, 'docs');

const checks = [
  {
    label: 'market- or language-specific scope',
    pattern: /\b(?:iran|iranian|persian|farsi)\b/giu,
  },
  {
    label: 'negative sentence construction',
    pattern:
      /\b(?:not|never|cannot|must\s+not|should\s+not|do\s+not|does\s+not|is\s+not|are\s+not|will\s+not|no\s+longer)\b|\b(?:mustn['’]t|shouldn['’]t|doesn['’]t|don['’]t|isn['’]t|aren['’]t|can['’]t|won['’]t)\b/giu,
  },
  {
    label: 'negative decision heading',
    pattern: /^#{1,6}\s+(?:Negative|Non-goals)\b/gimu,
  },
];

const findings = [];

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.vitepress') {
        await inspect(entryPath);
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = await readFile(entryPath, 'utf8');
      const lines = content.split(/\r?\n/u);

      for (const [index, line] of lines.entries()) {
        for (const check of checks) {
          check.pattern.lastIndex = 0;
          if (check.pattern.test(line)) {
            findings.push({
              file: path.relative(repositoryRoot, entryPath),
              line: index + 1,
              label: check.label,
              text: line.trim(),
            });
          }
        }
      }
    }
  }
}

await inspect(docsRoot);

if (findings.length > 0) {
  console.error(
    'Documentation language policy requires international scope and affirmative wording:',
  );
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.label}] ${finding.text}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log('Documentation language policy: valid');
}
