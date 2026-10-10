import * as z from 'zod';

const Instant = z.iso.datetime({ precision: 3 });
const Zone = z.string().min(1).max(255);

export const NutritionDayPolicyV1Schema = z.strictObject({
  policyVersion: z.string().min(1).max(128),
  initialTimeZone: Zone,
  changes: z.array(z.strictObject({ effectiveAt: Instant, timeZone: Zone })),
});

export type NutritionDayPolicyV1 = z.infer<typeof NutritionDayPolicyV1Schema>;

export interface NutritionPeriodV1 {
  readonly periodId: string;
  readonly zonePolicyVersion: string;
  readonly zoneSequence: number;
  readonly timeZone: string;
  readonly localDate: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly travelAdjusted: boolean;
}

const formatterByZone = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  const cached = formatterByZone.get(zone);
  if (cached) return cached;
  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatterByZone.set(zone, value);
  return value;
}

function localDate(timestamp: number, zone: string): string {
  const parts = formatter(zone).formatToParts(new Date(timestamp));
  const part = (type: string): string =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function nextCivilDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function firstInstantOnOrAfterDate(date: string, zone: string): number {
  const anchor = Date.parse(`${date}T00:00:00.000Z`);
  let lower = anchor - 172_800_000;
  let upper = anchor + 172_800_000;
  if (localDate(lower, zone) >= date || localDate(upper, zone) < date) {
    throw new RangeError(
      'The local date cannot be resolved in this time zone.',
    );
  }
  while (upper - lower > 1) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (localDate(middle, zone) >= date) upper = middle;
    else lower = middle;
  }
  return upper;
}

function dayStart(timestamp: number, zone: string): number {
  return firstInstantOnOrAfterDate(localDate(timestamp, zone), zone);
}

function nextDayStart(timestamp: number, zone: string): number {
  return firstInstantOnOrAfterDate(
    nextCivilDate(localDate(timestamp, zone)),
    zone,
  );
}

function validatedPolicy(input: NutritionDayPolicyV1): NutritionDayPolicyV1 {
  const policy = NutritionDayPolicyV1Schema.parse(input);
  formatter(policy.initialTimeZone);
  let previousInstant = Number.NEGATIVE_INFINITY;
  let previousZone = policy.initialTimeZone;
  for (const change of policy.changes) {
    formatter(change.timeZone);
    const instant = Date.parse(change.effectiveAt);
    if (instant <= previousInstant || change.timeZone === previousZone) {
      throw new TypeError('Zone changes must be ordered and effective.');
    }
    if (nextDayStart(instant - 1, previousZone) !== instant) {
      throw new TypeError(
        'A zone change must begin at the next boundary in the previous zone.',
      );
    }
    previousInstant = instant;
    previousZone = change.timeZone;
  }
  return policy;
}

export function nutritionPeriodAtV1(
  policyInput: NutritionDayPolicyV1,
  instant: string,
): NutritionPeriodV1 {
  const policy = validatedPolicy(policyInput);
  const timestamp = Date.parse(Instant.parse(instant));
  const sequence = policy.changes.findIndex(
    (change) => Date.parse(change.effectiveAt) > timestamp,
  );
  const activeIndex = sequence === -1 ? policy.changes.length : sequence;
  const previousChange = policy.changes[activeIndex - 1];
  const nextChange = policy.changes[activeIndex];
  const zone = previousChange?.timeZone ?? policy.initialTimeZone;
  const naturalStart = dayStart(timestamp, zone);
  const startsAt = Math.max(
    naturalStart,
    previousChange ? Date.parse(previousChange.effectiveAt) : -Infinity,
  );
  const endsAt = Math.min(
    nextDayStart(timestamp, zone),
    nextChange ? Date.parse(nextChange.effectiveAt) : Infinity,
  );
  if (endsAt <= startsAt || timestamp < startsAt || timestamp >= endsAt) {
    throw new TypeError('The nutrition period boundaries are invalid.');
  }
  const startIso = new Date(startsAt).toISOString();
  return {
    periodId: `${policy.policyVersion}:${activeIndex}:${startIso}`,
    zonePolicyVersion: policy.policyVersion,
    zoneSequence: activeIndex,
    timeZone: zone,
    localDate: localDate(startsAt, zone),
    startsAt: startIso,
    endsAt: new Date(endsAt).toISOString(),
    travelAdjusted:
      previousChange !== undefined &&
      startsAt === Date.parse(previousChange.effectiveAt),
  };
}

export function nutritionWindowAtV1(
  policy: NutritionDayPolicyV1,
  asOf: string,
): {
  readonly current: NutritionPeriodV1;
  readonly completed: readonly NutritionPeriodV1[];
} {
  const current = nutritionPeriodAtV1(policy, asOf);
  const completed: NutritionPeriodV1[] = [];
  let before = Date.parse(current.startsAt);
  for (let index = 0; index < 7; index += 1) {
    const period = nutritionPeriodAtV1(
      policy,
      new Date(before - 1).toISOString(),
    );
    completed.unshift(period);
    before = Date.parse(period.startsAt);
  }
  return { current, completed };
}
