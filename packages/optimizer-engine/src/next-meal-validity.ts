import type { NextMealRankingRequest } from './next-meal-ranking.js';
import type { NextMealTemporalPolicyReleaseV1 } from './next-meal-temporal-policy.js';

export const NEXT_MEAL_MAX_AGE_MINUTES_V1 = 15;

type TimedRule = Pick<
  NextMealRankingRequest['temporalRules'][number],
  | 'ruleId'
  | 'ruleVersion'
  | 'timeBasis'
  | 'windowStartInclusive'
  | 'windowEndExclusive'
>;
type TimedPolicyRule = Pick<
  NextMealTemporalPolicyReleaseV1['rules'][number],
  'ruleId' | 'ruleVersion' | 'window'
>;

/** The first instant when the frozen next-meal comparison needs a new run. */
export function nextMealValidUntilV1(
  request: {
    readonly candidates: Pick<
      NextMealRankingRequest['candidates'],
      'requestedAt'
    >;
    readonly temporalRules: readonly TimedRule[];
    readonly acceptedMeals: readonly Pick<
      NextMealRankingRequest['acceptedMeals'][number],
      'consumedAt'
    >[];
  },
  policy: { readonly rules: readonly TimedPolicyRule[] },
): string {
  const requestedAt = Date.parse(request.candidates.requestedAt);
  let validUntil = requestedAt + NEXT_MEAL_MAX_AGE_MINUTES_V1 * 60_000;
  const policyRules = new Map(policy.rules.map((rule) => [rule.ruleId, rule]));

  for (const rule of request.temporalRules) {
    const source = policyRules.get(rule.ruleId);
    if (!source || source.ruleVersion !== rule.ruleVersion)
      throw new TypeError('The active temporal rule has no matching policy.');
    if (rule.timeBasis === 'nutrition-day') {
      if (source.window.basis === 'elapsed-time')
        throw new TypeError(
          'The nutrition-day rule has a different time basis.',
        );
      validUntil = Math.min(validUntil, Date.parse(rule.windowEndExclusive));
      continue;
    }
    if (source.window.basis !== 'elapsed-time')
      throw new TypeError('The elapsed-time rule has a different time basis.');
    const duration = source.window.durationHours * 3_600_000;
    for (const meal of request.acceptedMeals) {
      const consumedAt = Date.parse(meal.consumedAt);
      if (
        consumedAt >= Date.parse(rule.windowStartInclusive) &&
        consumedAt < requestedAt
      ) {
        const leavesWindowAt = consumedAt + duration;
        if (leavesWindowAt > requestedAt)
          validUntil = Math.min(validUntil, leavesWindowAt);
      }
    }
  }
  if (validUntil <= requestedAt)
    throw new TypeError('The recommendation has no valid time interval.');
  return new Date(validUntil).toISOString();
}

export function nextMealIsCurrentV1(
  requestedAt: string,
  validUntil: string,
  now: string,
): boolean {
  const instant = Date.parse(now);
  return (
    Number.isFinite(instant) &&
    instant >= Date.parse(requestedAt) &&
    instant < Date.parse(validUntil)
  );
}
