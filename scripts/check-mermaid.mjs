import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import mermaid from 'mermaid';

const docsRoot = fileURLToPath(new URL('../docs/', import.meta.url));
const mermaidFence = /^```mermaid[^\n]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith('.') || entry.name === 'public') return [];

      const path = join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    }),
  );

  return files.flat();
}

const failures = [];
let diagramCount = 0;

for (const file of await markdownFiles(docsRoot)) {
  const source = await readFile(file, 'utf8');
  let match;
  let diagramIndex = 0;

  while ((match = mermaidFence.exec(source)) !== null) {
    diagramCount += 1;
    diagramIndex += 1;

    try {
      await mermaid.parse(match[1], { suppressErrors: true });
    } catch (error) {
      failures.push(
        `${relative(docsRoot, file)} diagram ${diagramIndex}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Invalid Mermaid diagrams:\n');
  console.error(failures.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${diagramCount} Mermaid diagrams.`);
}
