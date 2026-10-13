import { describe, expect, it } from 'vitest';

import {
  nextMealIsCurrentV1,
  nextMealValidUntilV1,
} from './next-meal-validity.js';

const requestedAt = '2026-10-12T12:00:00.000Z';

describe('next-meal run validity', () => {
  it('replays the same bounded lifetime for the same next-meal snapshot', () => {
    const request = {
      candidates: { requestedAt },
      acceptedMeals: [],
      temporalRules: [
        {
          ruleId: 'iron-day',
          ruleVersion: '1',
          timeBasis: 'nutrition-day' as const,
          windowStartInclusive: '2026-10-12T00:00:00.000Z',
          windowEndExclusive: '2026-10-13T00:00:00.000Z',
        },
      ],
    };
    const policy = {
      rules: [
        {
          ruleId: 'iron-day',
          ruleVersion: '1',
          window: { basis: 'nutrition-day' as const, periodCount: 1 },
        },
      ],
    };
    const first = nextMealValidUntilV1(request, policy);
    expect(nextMealValidUntilV1(request, policy)).toBe(first);
    expect(first).toBe('2026-10-12T12:15:00.000Z');
    expect(nextMealIsCurrentV1(requestedAt, first, requestedAt)).toBe(true);
    expect(nextMealIsCurrentV1(requestedAt, first, first)).toBe(false);
    expect(
      nextMealIsCurrentV1(requestedAt, first, '2026-10-12T11:59:59.999Z'),
    ).toBe(false);
  });

  it('expires at a nutrition-day boundary before the maximum age', () => {
    const request = {
      candidates: { requestedAt: '2026-10-12T23:55:00.000Z' },
      acceptedMeals: [],
      temporalRules: [
        {
          ruleId: 'iron-day',
          ruleVersion: '1',
          timeBasis: 'nutrition-day' as const,
          windowStartInclusive: '2026-10-12T00:00:00.000Z',
          windowEndExclusive: '2026-10-13T00:00:00.000Z',
        },
      ],
    };
    const policy = {
      rules: [
        {
          ruleId: 'iron-day',
          ruleVersion: '1',
          window: { basis: 'usual-intake' as const, periodCount: 3 },
        },
      ],
    };
    expect(nextMealValidUntilV1(request, policy)).toBe(
      '2026-10-13T00:00:00.000Z',
    );
  });

  it('expires when recorded intake leaves an elapsed-time window', () => {
    const request = {
      candidates: { requestedAt },
      acceptedMeals: [{ consumedAt: '2026-10-11T12:03:00.000Z' }],
      temporalRules: [
        {
          ruleId: 'iron-24-hours',
          ruleVersion: '1',
          timeBasis: 'elapsed-time' as const,
          windowStartInclusive: '2026-10-11T12:00:00.000Z',
          windowEndExclusive: '2026-10-12T12:00:00.001Z',
        },
      ],
    };
    const policy = {
      rules: [
        {
          ruleId: 'iron-24-hours',
          ruleVersion: '1',
          window: { basis: 'elapsed-time' as const, durationHours: 24 },
        },
      ],
    };
    expect(nextMealValidUntilV1(request, policy)).toBe(
      '2026-10-12T12:03:00.000Z',
    );
    expect(
      nextMealValidUntilV1({ ...request, acceptedMeals: [] }, policy),
    ).toBe('2026-10-12T12:15:00.000Z');
  });

  it('rejects a mismatched rule release during replay', () => {
    expect(() =>
      nextMealValidUntilV1(
        {
          candidates: { requestedAt },
          acceptedMeals: [],
          temporalRules: [
            {
              ruleId: 'iron-day',
              ruleVersion: '2',
              timeBasis: 'nutrition-day',
              windowStartInclusive: '2026-10-12T00:00:00.000Z',
              windowEndExclusive: '2026-10-13T00:00:00.000Z',
            },
          ],
        },
        {
          rules: [
            {
              ruleId: 'iron-day',
              ruleVersion: '1',
              window: { basis: 'nutrition-day', periodCount: 1 },
            },
          ],
        },
      ),
    ).toThrow('no matching policy');
  });
});
