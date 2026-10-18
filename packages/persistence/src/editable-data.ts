import {
  CANONICAL_SCHEMA_VERSION,
  CanonicalCodeSchema,
  CanonicalIdSchema,
  JsonValueSchema,
  OwningContextV1Schema,
  RecordProvenanceV1Schema,
  UtcInstantSchema,
  canonicalizeJson,
  type CanonicalRecordV1,
  type JsonValue,
} from '@nutrixx/canonical-schema';

import { PersistenceError } from './repository.js';

export const EDITABLE_RECORD_TYPES = new Set([
  'user-context.starting-profile',
  'user-context.outcome-observation',
  'user-context.nutrition-market',
  'user-context.nutrition-day-policy',
  'user-context.activity-level',
  'food.custom-version',
  'food.custom-head',
  'food.recipe-output-version',
  'recipe.identity',
  'recipe.version',
  'recipe.head',
  'consumption.meal-revision',
  'consumption.meal-head',
  'consumption.event',
]);

export interface EditableFactV1 {
  readonly action: 'upsert' | 'delete';
  readonly recordId: string;
  readonly subjectId: string;
  readonly recordType: string;
  readonly recordVersion: number;
  readonly logicalVersion: number;
  readonly owningContext: CanonicalRecordV1['owningContext'];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly correctionOf?: string;
  readonly provenance: CanonicalRecordV1['provenance'];
  readonly sourceRevision: string | null;
  readonly payload: JsonValue;
}

export interface EditableDataFileV1 {
  readonly format: 'nutrixx.local-file';
  readonly formatVersion: 1;
  readonly kind: 'editable-data';
  readonly protection: 'plain';
  readonly content: {
    readonly manifest: {
      readonly canonicalSchemaVersion: 1;
      readonly exportedAt: string;
      readonly subjectId: string;
      readonly factCount: number;
    };
    readonly facts: readonly EditableFactV1[];
  };
}

export type EditableChangeKind =
  | 'add'
  | 'correct'
  | 'delete'
  | 'unchanged'
  | 'conflict';

export interface EditableChangeV1 {
  readonly recordId: string;
  readonly recordType: string;
  readonly kind: EditableChangeKind;
  readonly reason?: 'stale-source' | 'missing-target' | 'identity-mismatch';
  readonly beforePayload?: JsonValue;
  readonly afterPayload?: JsonValue;
  readonly changedFields?: readonly string[];
}

export interface EditableImportPreviewV1 {
  readonly file: EditableDataFileV1;
  readonly changes: readonly EditableChangeV1[];
  readonly targetWasEmpty: boolean;
  readonly reviewDigest: string;
}

function invalid(message: string): never {
  throw new PersistenceError('invalid-export', message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = keys.sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

function changedFields(before: JsonValue, after: JsonValue): string[] {
  if (
    typeof before !== 'object' ||
    before === null ||
    Array.isArray(before) ||
    typeof after !== 'object' ||
    after === null ||
    Array.isArray(after)
  )
    return ['$'];
  const left = before as Record<string, JsonValue>;
  const right = after as Record<string, JsonValue>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(
      (key) =>
        !(key in left) ||
        !(key in right) ||
        canonicalizeJson(left[key]!) !== canonicalizeJson(right[key]!),
    )
    .sort();
}

export function isEditableUserRecord(record: CanonicalRecordV1): boolean {
  return EDITABLE_RECORD_TYPES.has(record.recordType);
}

export function createEditableDataFileV1(
  records: readonly CanonicalRecordV1[],
  subjectId: string,
  exportedAt: string,
): EditableDataFileV1 {
  if (
    !CanonicalIdSchema.safeParse(subjectId).success ||
    !UtcInstantSchema.safeParse(exportedAt).success
  ) {
    invalid('The editable export identity or timestamp is invalid.');
  }
  const facts = records
    .filter(
      (record) =>
        record.subjectId === subjectId && isEditableUserRecord(record),
    )
    .map(
      (record): EditableFactV1 => ({
        action: 'upsert',
        recordId: record.recordId,
        subjectId: record.subjectId,
        recordType: record.recordType,
        recordVersion: record.recordVersion,
        logicalVersion: record.logicalVersion,
        owningContext: record.owningContext,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.correctionOf === undefined
          ? {}
          : { correctionOf: record.correctionOf }),
        provenance: structuredClone(record.provenance),
        sourceRevision: record.integrity.value,
        payload: structuredClone(record.payload),
      }),
    )
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  return {
    format: 'nutrixx.local-file',
    formatVersion: 1,
    kind: 'editable-data',
    protection: 'plain',
    content: {
      manifest: {
        canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
        exportedAt,
        subjectId,
        factCount: facts.length,
      },
      facts,
    },
  };
}

export function validateEditableDataFileV1(input: unknown): EditableDataFileV1 {
  if (
    !isObject(input) ||
    !hasOnlyKeys(input, [
      'format',
      'formatVersion',
      'kind',
      'protection',
      'content',
    ]) ||
    input['format'] !== 'nutrixx.local-file' ||
    input['formatVersion'] !== 1 ||
    input['kind'] !== 'editable-data' ||
    input['protection'] !== 'plain' ||
    !isObject(input['content']) ||
    !hasOnlyKeys(input['content'], ['manifest', 'facts']) ||
    !isObject(input['content']['manifest']) ||
    !Array.isArray(input['content']['facts'])
  ) {
    invalid('The editable data file has an unsupported structure.');
  }
  const content = input['content'];
  const manifest = content['manifest'] as Record<string, unknown>;
  const candidates = content['facts'] as unknown[];
  if (
    !hasOnlyKeys(manifest, [
      'canonicalSchemaVersion',
      'exportedAt',
      'subjectId',
      'factCount',
    ]) ||
    manifest['canonicalSchemaVersion'] !== CANONICAL_SCHEMA_VERSION ||
    !UtcInstantSchema.safeParse(manifest['exportedAt']).success ||
    !CanonicalIdSchema.safeParse(manifest['subjectId']).success ||
    !Number.isSafeInteger(manifest['factCount']) ||
    manifest['factCount'] !== candidates.length ||
    candidates.length > 10_000
  ) {
    invalid('The editable data manifest is invalid.');
  }
  const seen = new Set<string>();
  const facts: EditableFactV1[] = [];
  for (const candidate of candidates) {
    if (
      !isObject(candidate) ||
      !hasOnlyKeys(candidate, [
        'action',
        'recordId',
        'subjectId',
        'recordType',
        'recordVersion',
        'logicalVersion',
        'owningContext',
        'createdAt',
        'updatedAt',
        'provenance',
        'sourceRevision',
        'payload',
        ...(candidate['correctionOf'] === undefined ? [] : ['correctionOf']),
      ]) ||
      (candidate['action'] !== 'upsert' && candidate['action'] !== 'delete') ||
      !CanonicalIdSchema.safeParse(candidate['recordId']).success ||
      candidate['subjectId'] !== manifest['subjectId'] ||
      !CanonicalCodeSchema.safeParse(candidate['recordType']).success ||
      !EDITABLE_RECORD_TYPES.has(candidate['recordType'] as string) ||
      !Number.isSafeInteger(candidate['recordVersion']) ||
      Number(candidate['recordVersion']) < 1 ||
      !Number.isSafeInteger(candidate['logicalVersion']) ||
      Number(candidate['logicalVersion']) < 1 ||
      !OwningContextV1Schema.safeParse(candidate['owningContext']).success ||
      !UtcInstantSchema.safeParse(candidate['createdAt']).success ||
      !UtcInstantSchema.safeParse(candidate['updatedAt']).success ||
      (candidate['correctionOf'] !== undefined &&
        !CanonicalIdSchema.safeParse(candidate['correctionOf']).success) ||
      !RecordProvenanceV1Schema.safeParse(candidate['provenance']).success ||
      (candidate['sourceRevision'] !== null &&
        (typeof candidate['sourceRevision'] !== 'string' ||
          !SHA256_HEX.test(candidate['sourceRevision']))) ||
      !JsonValueSchema.safeParse(candidate['payload']).success ||
      seen.has(candidate['recordId'] as string)
    ) {
      invalid('The editable data file contains an invalid or duplicate fact.');
    }
    seen.add(candidate['recordId'] as string);
    facts.push(structuredClone(candidate) as unknown as EditableFactV1);
  }
  return {
    format: 'nutrixx.local-file',
    formatVersion: 1,
    kind: 'editable-data',
    protection: 'plain',
    content: {
      manifest: structuredClone(
        manifest,
      ) as unknown as EditableDataFileV1['content']['manifest'],
      facts,
    },
  };
}

export function classifyEditableChange(
  fact: EditableFactV1,
  existing: CanonicalRecordV1 | null,
  targetWasEmpty = false,
): EditableChangeV1 {
  const base = { recordId: fact.recordId, recordType: fact.recordType };
  if (existing === null) {
    if (fact.sourceRevision !== null && !targetWasEmpty) {
      return {
        ...base,
        kind: 'conflict',
        reason: 'missing-target',
        afterPayload: fact.payload,
      };
    }
    return fact.action === 'delete'
      ? { ...base, kind: 'unchanged' }
      : { ...base, kind: 'add', afterPayload: fact.payload };
  }
  if (fact.sourceRevision !== existing.integrity.value) {
    return {
      ...base,
      kind: 'conflict',
      reason: 'stale-source',
      beforePayload: existing.payload,
      afterPayload: fact.payload,
    };
  }
  if (
    fact.subjectId !== existing.subjectId ||
    fact.recordType !== existing.recordType ||
    fact.recordVersion !== existing.recordVersion ||
    fact.logicalVersion !== existing.logicalVersion ||
    fact.owningContext !== existing.owningContext ||
    fact.createdAt !== existing.createdAt ||
    fact.updatedAt !== existing.updatedAt ||
    fact.correctionOf !== existing.correctionOf ||
    canonicalizeJson(fact.provenance as unknown as JsonValue) !==
      canonicalizeJson(existing.provenance as unknown as JsonValue)
  ) {
    return {
      ...base,
      kind: 'conflict',
      reason: 'identity-mismatch',
      beforePayload: existing.payload,
      afterPayload: fact.payload,
    };
  }
  if (fact.action === 'delete') {
    return { ...base, kind: 'delete', beforePayload: existing.payload };
  }
  if (canonicalizeJson(fact.payload) === canonicalizeJson(existing.payload)) {
    return { ...base, kind: 'unchanged' };
  }
  return {
    ...base,
    kind: 'correct',
    beforePayload: existing.payload,
    afterPayload: fact.payload,
    changedFields: changedFields(existing.payload, fact.payload),
  };
}
