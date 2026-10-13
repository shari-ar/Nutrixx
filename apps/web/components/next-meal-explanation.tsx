import {
  nextMealSourceKey,
  type NextMealCandidateExplanationV1,
  type NextMealRankedCandidate,
} from '@nutrixx/optimizer-engine';
import Link from 'next/link';

import type { NextMealRunV1 } from '@/lib/browser-planning';

function decimal(ratio: { numerator: string; denominator: string }): string {
  const numerator = BigInt(ratio.numerator);
  const denominator = BigInt(ratio.denominator);
  const scaled =
    (numerator * BigInt(100) + denominator / BigInt(2)) / denominator;
  const digits = scaled.toString().padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`.replace(/\.0+$/, '');
}

function utc(instant: string): string {
  return instant.replace('T', ' ').replace('Z', ' UTC');
}

function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function nutrientName(id: string): string {
  return id.replace(/^nutrient\./, '').replaceAll('-', ' ');
}

function windowBasis(
  window:
    | { readonly basis: 'elapsed-time'; readonly durationHours: number }
    | {
        readonly basis: 'nutrition-day' | 'usual-intake';
        readonly periodCount: number;
      },
): string {
  return window.basis === 'elapsed-time'
    ? `${window.durationHours} elapsed hours`
    : `${window.periodCount} nutrition day${window.periodCount === 1 ? '' : 's'} (${window.basis.replaceAll('-', ' ')})`;
}

function Citation({
  citation,
  purpose,
}: {
  readonly citation: {
    readonly authority: string;
    readonly title: string;
    readonly edition: string;
    readonly url: string;
    readonly relevantSection: string;
  };
  readonly purpose: string;
}) {
  const url = safeSourceUrl(citation.url);
  return (
    <p>
      {purpose}: {citation.authority}, {citation.title} ({citation.edition}),{' '}
      {citation.relevantSection}.{' '}
      {url ? (
        <a href={url} rel="noopener noreferrer" target="_blank">
          Open source
        </a>
      ) : (
        <span>Source link unavailable</span>
      )}
    </p>
  );
}

export function NextMealRunOverview({ run }: { readonly run: NextMealRunV1 }) {
  const provisional = run.appliedTemporalRules.filter(
    (rule) => rule.decision === 'PROVISIONAL_SHORT_HISTORY',
  ).length;
  return (
    <div className="mt-4 rounded-xl border border-separator bg-background/60 p-4 text-sm">
      <h3 className="font-semibold">What shaped this next-meal ranking</h3>
      <p className="mt-2 text-muted">
        {run.input.temporalRules.length} nutrient comparisons use their own
        recorded-intake windows. Only meals recorded by{' '}
        <time dateTime={run.input.candidates.requestedAt}>
          {utc(run.input.candidates.requestedAt)}
        </time>{' '}
        count. This recommendation expires at{' '}
        <time dateTime={run.validUntil}>{utc(run.validUntil)}</time>.
      </p>
      {provisional > 0 ? (
        <p className="mt-2 text-muted">
          {provisional} comparison{provisional === 1 ? '' : 's'} use a shorter
          recorded history. Their actual and configured windows appear in each
          food’s details.
        </p>
      ) : null}
      <p className="mt-2 text-muted">
        Assumption: you logged everything you consumed, including drinks and
        supplements. Missing entries can change the ranking. This estimates
        dietary intake for one upcoming meal; it does not measure nutrient
        stores in your body.
      </p>
    </div>
  );
}

export function NextMealExplanation({
  run,
  row,
  explanation,
}: {
  readonly run: NextMealRunV1;
  readonly row: NextMealRankedCandidate;
  readonly explanation: NextMealCandidateExplanationV1;
}) {
  const candidate = run.input.candidates.entries.find(
    (entry) => nextMealSourceKey(entry.reference) === row.candidateKey,
  );
  const policies = new Map(
    run.temporalPolicy.rules.map((rule) => [rule.ruleId, rule]),
  );
  const scoredRules = new Map(
    run.input.temporalRules.map((rule) => [rule.ruleId, rule]),
  );
  const applied = new Map(
    run.appliedTemporalRules.map((rule) => [rule.ruleId, rule]),
  );
  const comparisons = explanation.comparisons ?? [];
  return (
    <div className="mt-3 text-sm">
      <p className="text-muted">
        Rank {row.rank} of {run.result.ranked.length} comparable options ·{' '}
        {comparisons.length} nutrient comparison
        {comparisons.length === 1 ? '' : 's'} · combined target gap{' '}
        {decimal(row.weightedDistance)}. A smaller gap ranks earlier within this
        run; ties use the largest single gap, portion size, then stable IDs.
        This gap is not a health score.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium">Why this rank?</summary>
        <p className="mt-2 text-muted">
          Each comparison uses the actual recorded intake in its own window and
          this food’s suggested edible portion. All times below are UTC; the
          window end is exclusive.
        </p>
        <ul className="mt-3 space-y-3">
          {comparisons.map((fact) => {
            const policy = policies.get(fact.ruleId);
            const scoredRule = scoredRules.get(fact.ruleId);
            const span = applied.get(fact.ruleId);
            const composition = candidate?.nutrientsPer100EdibleGrams.find(
              (item) => item.nutrientId === fact.nutrientId,
            );
            return (
              <li
                className="rounded-lg border border-separator p-3"
                key={fact.ruleId}
              >
                <h4 className="font-medium capitalize">
                  {nutrientName(fact.nutrientId)}
                </h4>
                <p className="mt-1 text-muted">
                  Recorded {decimal(fact.recordedAmount)} → projected{' '}
                  {decimal(fact.projectedAmount)} {fact.unit.code}; comparison
                  target {fact.targetAmount} {fact.unit.code} (
                  {fact.referenceType}, {fact.targetMode}). Relative target gap:{' '}
                  {decimal({
                    numerator: (
                      BigInt(fact.normalizedDistance.numerator) * BigInt(100)
                    ).toString(),
                    denominator: fact.normalizedDistance.denominator,
                  })}
                  %.
                  {scoredRule
                    ? ` Weight in combined gap: ${scoredRule.weight}.`
                    : ''}
                </p>
                <p className="mt-1 text-muted">
                  Applied window:{' '}
                  <time dateTime={fact.windowStartInclusive}>
                    {utc(fact.windowStartInclusive)}
                  </time>{' '}
                  to{' '}
                  <time dateTime={fact.windowEndExclusive}>
                    {utc(fact.windowEndExclusive)}
                  </time>
                  . {fact.acceptedMealIds.length} recorded meal
                  {fact.acceptedMealIds.length === 1 ? '' : 's'} included.
                </p>
                {fact.acceptedMealIds.length > 0 ? (
                  <details className="mt-1 text-xs text-muted">
                    <summary className="cursor-pointer">Meals used</summary>
                    <ul className="mt-1 list-inside list-disc">
                      {fact.acceptedMealIds.map((mealId) => (
                        <li key={mealId}>
                          <Link className="underline" href={`/meals/${mealId}`}>
                            Meal {mealId}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {span?.decision === 'PROVISIONAL_SHORT_HISTORY' ? (
                  <p className="mt-1 text-muted">
                    Short history: the configured window starts at{' '}
                    <time dateTime={span.configuredWindowStartInclusive}>
                      {utc(span.configuredWindowStartInclusive)}
                    </time>
                    ; recorded tracking begins at the applied start above.
                  </p>
                ) : (
                  <p className="mt-1 text-muted">
                    The configured history window was available. Complete
                    logging remains your stated-data assumption.
                  </p>
                )}
                {policy ? (
                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <p>
                      Rule {policy.ruleId} ({policy.ruleVersion}); aggregation:{' '}
                      {policy.aggregation.replaceAll('-', ' ')}; window basis:{' '}
                      {windowBasis(policy.window)}; reference release{' '}
                      {fact.referenceReleaseId}.
                    </p>
                    <Citation
                      citation={policy.reference.citation}
                      purpose="Reference source"
                    />
                    <Citation
                      citation={policy.horizonCitation}
                      purpose="Time-window source"
                    />
                    <p>Application limit: {policy.limitations}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-danger">
                    The frozen temporal policy is unavailable for this rule.
                  </p>
                )}
                {composition?.state === 'known' ? (
                  <p className="mt-2 text-xs text-muted">
                    Food composition: {composition.source.kind} source{' '}
                    {composition.source.sourceId}
                    {composition.source.sourceVersion
                      ? `, version ${composition.source.sourceVersion}`
                      : ''}
                    {composition.source.sourceRecordId
                      ? `, record ${composition.source.sourceRecordId}`
                      : ''}
                    .
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
