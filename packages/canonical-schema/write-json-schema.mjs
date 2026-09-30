import { mkdir, writeFile } from 'node:fs/promises';

import { canonicalRecordV1JsonSchema } from './dist/index.js';

await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./dist/canonical-record-v1.schema.json', import.meta.url),
  `${JSON.stringify(canonicalRecordV1JsonSchema, null, 2)}\n`,
  'utf8',
);
