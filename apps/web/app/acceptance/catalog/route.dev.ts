import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { STAGE_4_CATALOG_PATH } from '@/lib/next-meal-acceptance-fixture';

export async function GET() {
  const artifact = await readFile(
    path.join(process.cwd(), 'public', STAGE_4_CATALOG_PATH.slice(1)),
  );
  return new Response(Uint8Array.from(artifact), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
