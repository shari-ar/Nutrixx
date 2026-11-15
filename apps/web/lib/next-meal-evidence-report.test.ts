import { describe, expect, it } from 'vitest';

import {
  createNextMealEvidenceReportV1,
  nextMealEvidenceReportFileName,
  verifyNextMealEvidenceReportV1,
} from './next-meal-evidence-report';

const digest = async (input: string): Promise<string> =>
  `digest:${input.length}:${input.charCodeAt(0)}`;

describe('next-meal evidence report', () => {
  it('seals exact decision evidence and detects later changes', async () => {
    const candidateKey = 'food:fixture:00000000-0000-4000-8000-000000000001:1';
    const run = {
      validUntil: '2026-10-12T12:15:00.000Z',
      input: {
        planningPolicy: {
          policyVersion: 'fixture-policy',
          horizonDays: 3,
          robustScenarios: [],
        },
        candidates: {
          requestedAt: '2026-10-12T12:00:00.000Z',
          entries: [
            {
              reference: {
                kind: 'food',
                catalogReleaseId: 'fixture',
                foodId: '00000000-0000-4000-8000-000000000001',
                foodRevision: 1,
              },
              displayName: 'Test food',
              nutrientsPer100EdibleGrams: [
                {
                  state: 'known',
                  nutrientId: 'nutrient.iron',
                  amountPer100EdibleGrams: '5',
                  unit: { system: 'ucum', code: 'mg' },
                  source: {
                    kind: 'dataset',
                    sourceId: 'fixture-composition',
                    sourceVersion: '1',
                  },
                },
              ],
            },
          ],
        },
        temporalRules: [{ ruleId: 'iron-rule', weight: 2 }],
      },
      temporalPolicy: {
        rules: [
          {
            ruleId: 'iron-rule',
            ruleVersion: '1',
            aggregation: 'sum',
            window: { basis: 'elapsed-time', durationHours: 24 },
            limitations: 'Recorded intake only.',
            reference: { citation: { title: 'Target source' } },
            horizonCitation: { title: 'Window source' },
          },
        ],
      },
      appliedTemporalRules: [
        { ruleId: 'iron-rule', decision: 'FULL_HORIZON_AVAILABLE' },
      ],
    };
    const explanation = {
      candidateKey,
      classification: 'COMPARABLE',
      displayName: 'Test food',
      reasonCodes: ['validated-comparable'],
      rank: 1,
      portionId: '00000000-0000-4000-8000-000000000002',
      edibleGrams: '100',
      comparisons: [
        {
          ruleId: 'iron-rule',
          nutrientId: 'nutrient.iron',
          unit: { system: 'ucum', code: 'mg' },
          windowStartInclusive: '2026-10-11T12:00:00.000Z',
          windowEndExclusive: '2026-10-12T12:00:00.000Z',
          targetAmount: '18',
          targetMode: 'minimum',
          referenceType: 'rda',
          referenceReleaseId: 'fixture-reference',
          recordedAmount: { numerator: '2', denominator: '1' },
          projectedAmount: { numerator: '7', denominator: '1' },
          normalizedDistance: { numerator: '11', denominator: '18' },
          acceptedMealIds: ['00000000-0000-4000-8000-000000000003'],
        },
      ],
    };
    const report = await createNextMealEvidenceReportV1(
      {
        run: run as never,
        row: {
          candidateKey,
          rank: 1,
          score: { numerator: '11', denominator: '18' },
        },
        explanation: explanation as never,
        generatedAt: '2026-10-12T12:01:00.000Z',
      },
      digest,
    );
    await expect(verifyNextMealEvidenceReportV1(report, digest)).resolves.toBe(
      true,
    );
    await expect(
      verifyNextMealEvidenceReportV1(
        {
          ...report,
          payload: { ...(report.payload as object), changed: true },
        },
        digest,
      ),
    ).resolves.toBe(false);
    expect(nextMealEvidenceReportFileName(report, 'Test Food!')).toBe(
      'nutrixx-next-meal-evidence-test-food-2026-10-12.json',
    );
  });
});
