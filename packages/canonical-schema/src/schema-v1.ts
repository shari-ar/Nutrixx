import * as z from 'zod';

import { CanonicalRecordV1Schema } from './record.js';

export const canonicalRecordV1JsonSchema = z.toJSONSchema(
  CanonicalRecordV1Schema,
  {
    target: 'draft-2020-12',
  },
);
