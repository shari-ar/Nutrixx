import { describe, expect, it } from 'vitest';

import { validateAgentCurationBatchV1 } from './agent-curation.js';

const digest = 'a'.repeat(64);
const context = {
  catalog: { releaseId: 'catalog-1', artifactSha256: digest },
  foods: [
    {
      foodId: 'food.apple',
      revision: 1,
      preparationStates: ['raw'],
    },
  ],
  components: [{ componentId: 'nutrient.protein', unit: 'g' }],
} as const;

function claim(overrides: Record<string, unknown> = {}) {
  return {
    claimId: 'claim.apple.protein',
    foodId: 'food.apple',
    foodRevision: 1,
    preparationState: 'raw',
    componentId: 'nutrient.protein',
    value: {
      amount: '0.3',
      unit: { system: 'ucum', code: 'g' },
      basis: 'per-100-gram-edible',
    },
    evidence: {
      sourceTitle: 'Primary composition table',
      publisher: 'Example laboratory',
      sourceUrl: 'https://example.test/table',
      sourceEdition: '2026',
      licenseId: 'TEST-1.0',
      locator: 'Table 1, row Apple',
      retrievedAt: '2026-10-24T10:00:00.000Z',
      sourceContentSha256: digest,
      method: 'direct-transcription',
    },
    ...overrides,
  };
}

function batch(claims: readonly unknown[]) {
  return {
    format: 'nutrixx.agent-curation-batch',
    schemaVersion: 1,
    batchId: 'batch-1',
    generatedAt: '2026-10-24T10:05:00.000Z',
    catalog: context.catalog,
    agent: {
      agentId: 'agent-1',
      model: 'example-model',
      instructionSha256: digest,
    },
    claims,
  };
}

describe('agent curation intake', () => {
  it('accepts an exact, source-attributed catalog value', () => {
    const result = validateAgentCurationBatchV1(batch([claim()]), context);

    expect(result.accepted).toHaveLength(1);
    expect(result.quarantined).toEqual([]);
  });

  it('quarantines one invalid claim without blocking a valid claim', () => {
    const result = validateAgentCurationBatchV1(
      batch([
        claim(),
        claim({
          claimId: 'claim.apple.protein.bad',
          value: {
            amount: '1',
            unit: { system: 'ucum', code: 'mg' },
            basis: 'per-100-gram-edible',
          },
        }),
      ]),
      context,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.quarantined).toEqual([
      {
        index: 1,
        reason: 'The value unit differs from the active component registry.',
      },
    ]);
  });

  it('quarantines duplicate targets instead of selecting one implicitly', () => {
    const result = validateAgentCurationBatchV1(
      batch([claim(), claim({ claimId: 'claim.apple.protein.second' })]),
      context,
    );

    expect(result.accepted).toEqual([]);
    expect(result.quarantined).toHaveLength(2);
  });
});
