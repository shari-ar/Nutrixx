import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { canonicalizeJson } from './canonical-json.js';
import {
  CanonicalDecimalSchema,
  CanonicalFractionSchema,
} from './primitives.js';
import {
  CanonicalRecordDraftV1Schema,
  canonicalRecordHashInput,
  createCanonicalRecordV1Schema,
  sealCanonicalRecordV1,
  verifyCanonicalRecordV1,
} from './record.js';
import { canonicalRecordV1JsonSchema } from './schema-v1.js';
import { EvidenceValueV1Schema, QuantityV1Schema } from './value-objects.js';

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const profileDraft = {
  format: 'nutrixx.canonical-record',
  schemaVersion: 1,
  recordType: 'user-context.profile',
  recordVersion: 1,
  recordId: '3d813cbb-47fb-42ba-91df-831e1593ac29',
  subjectId: '2889db50-9d55-4f2f-b21d-5b4e728ca4f1',
  owningContext: 'user-context',
  logicalVersion: 1,
  createdAt: '2026-09-29T10:15:30.000Z',
  updatedAt: '2026-09-29T10:15:30.000Z',
  provenance: {
    method: 'user-entered',
    source: {
      kind: 'user',
      sourceId: 'urn:nutrixx:source:self',
    },
    recordedAt: '2026-09-29T10:15:30.000Z',
  },
  payload: {
    locale: 'en-US',
    timeZone: 'Asia/Tehran',
  },
} as const;

describe('Canonical Schema v1', () => {
  it('seals and verifies a storage-neutral record', async () => {
    const record = await sealCanonicalRecordV1(profileDraft, sha256Hex);

    expect(record.integrity.value).toBe(
      sha256Hex(canonicalRecordHashInput(record)),
    );
    await expect(verifyCanonicalRecordV1(record, sha256Hex)).resolves.toBe(
      true,
    );
  });

  it('rejects undeclared physical-storage fields', () => {
    expect(() =>
      CanonicalRecordDraftV1Schema.parse({
        ...profileDraft,
        objectStore: 'profiles',
      }),
    ).toThrow();
  });

  it('binds a record type to its registered payload contract', async () => {
    const profilePayloadSchema = z.strictObject({
      locale: z.literal('en-US'),
      timeZone: z.literal('Asia/Tehran'),
    });
    const profileSchema = createCanonicalRecordV1Schema(
      'user-context.profile',
      1,
      profilePayloadSchema,
    );
    const record = await sealCanonicalRecordV1(profileDraft, sha256Hex);

    expect(profileSchema.parse(record).payload.timeZone).toBe('Asia/Tehran');
    expect(() =>
      profileSchema.parse({
        ...record,
        payload: { locale: 'en-US', timeZone: 'Europe/London' },
      }),
    ).toThrow();
  });

  it('keeps unknown evidence distinct from numeric zero', () => {
    expect(
      EvidenceValueV1Schema.parse({
        state: 'unknown',
        reason: 'not-measured',
      }),
    ).toEqual({ state: 'unknown', reason: 'not-measured' });
    expect(
      QuantityV1Schema.parse({
        value: '0',
        unit: { system: 'ucum', code: 'g' },
        basis: 'absolute',
      }).value,
    ).toBe('0');
  });

  it.each(['01', '1.0', '1e3', '+1', '-0'])(
    'rejects non-canonical decimal %s',
    (value) => {
      expect(CanonicalDecimalSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(['-0.1', '1.01', '100'])(
    'rejects out-of-range canonical fraction %s',
    (value) => {
      expect(CanonicalFractionSchema.safeParse(value).success).toBe(false);
    },
  );

  it('uses deterministic RFC 8785 property order', () => {
    expect(
      canonicalizeJson({
        z: 1,
        nested: { b: true, a: null },
        a: 'first',
      }),
    ).toBe('{"a":"first","nested":{"a":null,"b":true},"z":1}');
  });

  it('rejects negative zero during canonicalization', () => {
    expect(() => canonicalizeJson(-0)).toThrow(/negative zero/);
  });

  it('exports JSON Schema Draft 2020-12 with a stable identity', () => {
    expect(canonicalRecordV1JsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'urn:nutrixx:schema:canonical-record:1',
      title: 'CanonicalRecordV1',
      type: 'object',
      additionalProperties: false,
    });
  });
});
