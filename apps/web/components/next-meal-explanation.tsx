import {
  nextMealSourceKey,
  type NextMealCandidateExplanationV1,
  type NextMealCompactRankingResultV1,
} from '@nutrixx/optimizer-engine';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type {
  NextMealDisplayExplanationV1,
  NextMealDisplayRunV1,
} from '@/lib/browser-planning';
import {
  createNextMealEvidenceReportV1,
  nextMealEvidenceReportFileName,
  serializeNextMealEvidenceReportV1,
} from '@/lib/next-meal-evidence-report';

import {
  NextMealProvenanceGraph,
  type ProvenanceGraphNodeV1,
} from './next-meal-provenance-graph';

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

function objectiveReason(
  objectiveId: NonNullable<
    NextMealCandidateExplanationV1['rankReason']
  >['decisiveObjectiveId'],
): string {
  switch (objectiveId) {
    case 'nutrition.robust-maximum-gap':
      return 'a smaller worst-case nutrient gap';
    case 'nutrition.robust-weighted-gap':
      return 'a better overall balance in the least favorable schedule';
    case 'nutrition.terminal-maximum-gap':
      return 'a safer continuation after the planning horizon';
    case 'nutrition.terminal-weighted-gap':
      return 'a better overall state at the end of the simulated horizon';
    case 'nutrition.nominal-maximum-gap':
      return 'a smaller largest nutrient gap in the expected schedule';
    case 'nutrition.nominal-weighted-gap':
      return 'a better overall balance in the expected schedule';
    case 'nutrition.immediate-maximum-gap':
      return 'a smaller largest gap immediately after this meal';
    case 'nutrition.immediate-weighted-gap':
      return 'a better immediate nutrition balance';
    case 'practicality.portion-size':
      return 'the same higher-priority result with a smaller practical portion';
    case 'context.variety-repetition':
      return 'less repetition across the modeled horizon';
    case 'stability.deterministic-identity':
      return 'an identical higher-priority result and the stable tie-break';
  }
  throw new TypeError(`Unknown ranking objective: ${objectiveId}`);
}

type ComparisonFact = NonNullable<
  NextMealCandidateExplanationV1['comparisons']
>[number];
type Fraction = readonly [numerator: bigint, denominator: bigint];

function ratioFraction(value: {
  readonly numerator: string;
  readonly denominator: string;
}): Fraction {
  return [BigInt(value.numerator), BigInt(value.denominator)];
}

function decimalFraction(value: string): Fraction {
  const [whole = '0', decimals = ''] = value.split('.');
  return [
    BigInt(`${whole}${decimals}`),
    BigInt(`1${'0'.repeat(decimals.length)}`),
  ];
}

function percent(value: Fraction): number {
  const zero = BigInt(0);
  if (value[1] === zero) return 0;
  const numerator = value[0] < zero ? -value[0] : value[0];
  return (
    Number((numerator * BigInt(1_000) + value[1] / BigInt(2)) / value[1]) / 10
  );
}

function coveragePercent(amount: Fraction, target: Fraction): number {
  if (target[0] <= BigInt(0)) return 0;
  return percent([amount[0] * target[1], amount[1] * target[0]]);
}

function recordedGapPercent(fact: ComparisonFact): number {
  const recorded = ratioFraction(fact.recordedAmount);
  const target = decimalFraction(fact.targetAmount);
  const zero = BigInt(0);
  if (target[0] <= zero) return 0;
  const differenceNumerator = target[0] * recorded[1] - recorded[0] * target[1];
  const distance =
    fact.targetMode === 'minimum' && differenceNumerator < zero
      ? zero
      : differenceNumerator;
  return percent([distance, recorded[1] * target[0]]);
}

function projectedGapPercent(fact: ComparisonFact): number {
  return percent(ratioFraction(fact.normalizedDistance));
}

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function TargetProgress({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: 'before' | 'after';
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium">{displayNumber(value)}%</span>
      </div>
      <div
        aria-label={`${label}: ${displayNumber(value)}% of target`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(bounded)}
        className="mt-1 h-2 overflow-hidden rounded-full bg-separator"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full ${
            tone === 'after' ? 'bg-accent' : 'bg-muted/45'
          }`}
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
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

export function NextMealRunOverview({
  run,
}: {
  readonly run: NextMealDisplayRunV1;
}) {
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
      <p className="mt-2 text-muted">
        Each next option was tested as the first action in a{' '}
        {run.input.planningPolicy.horizonDays}-day rolling horizon with{' '}
        {run.input.planningPolicy.opportunitiesPerDay} modeled eating
        opportunities per day and{' '}
        {run.input.planningPolicy.robustScenarios.length} schedule scenario
        {run.input.planningPolicy.robustScenarios.length === 1 ? '' : 's'}. Only
        the next meal is suggested; later actions are simulations, not a
        committed menu. The complete calculation runs again after actual intake
        is recorded.
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
  loadExplanation,
}: {
  readonly run: NextMealDisplayRunV1;
  readonly row: NextMealCompactRankingResultV1['ranked'][number];
  readonly explanation: NextMealDisplayExplanationV1;
  readonly loadExplanation: (
    signal: AbortSignal,
  ) => Promise<NextMealCandidateExplanationV1>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<NextMealCandidateExplanationV1 | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportState, setReportState] = useState<
    'IDLE' | 'CREATING' | 'DOWNLOADED' | 'FAILED'
  >('IDLE');
  const active = useRef(true);
  const loadingRequest = useRef(false);
  const explanationController = useRef<AbortController | null>(null);
  const cancelExplanation = () => {
    const controller = explanationController.current;
    if (!controller) return;
    explanationController.current = null;
    loadingRequest.current = false;
    controller.abort();
    if (active.current) setLoading(false);
  };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      const controller = explanationController.current;
      explanationController.current = null;
      loadingRequest.current = false;
      controller?.abort();
    };
  }, []);
  const requestDetails = async () => {
    if (details || loadingRequest.current) return;
    const controller = new AbortController();
    explanationController.current = controller;
    loadingRequest.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await loadExplanation(controller.signal);
      if (
        loaded.candidateKey !== explanation.candidateKey ||
        loaded.classification !== explanation.classification
      )
        throw new TypeError('The saved explanation no longer matches.');
      if (
        active.current &&
        explanationController.current === controller &&
        !controller.signal.aborted
      )
        setDetails(loaded);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (active.current)
        setLoadError('The detailed explanation could not be loaded.');
    } finally {
      if (explanationController.current === controller) {
        explanationController.current = null;
        loadingRequest.current = false;
        if (active.current) setLoading(false);
      }
    }
  };
  const downloadEvidenceReport = async () => {
    if (!details || reportState === 'CREATING') return;
    setReportState('CREATING');
    try {
      const report = await createNextMealEvidenceReportV1({
        run,
        row,
        explanation: details,
      });
      const href = URL.createObjectURL(
        new Blob([serializeNextMealEvidenceReportV1(report)], {
          type: 'application/json;charset=utf-8',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = nextMealEvidenceReportFileName(
        report,
        details.displayName,
      );
      anchor.click();
      queueMicrotask(() => URL.revokeObjectURL(href));
      setReportState('DOWNLOADED');
    } catch {
      setReportState('FAILED');
    }
  };
  const candidate =
    expanded && details
      ? run.input.candidates.entries.find(
          (entry) => nextMealSourceKey(entry.reference) === row.candidateKey,
        )
      : undefined;
  const policies =
    expanded && details
      ? new Map(run.temporalPolicy.rules.map((rule) => [rule.ruleId, rule]))
      : null;
  const scoredRules =
    expanded && details
      ? new Map(run.input.temporalRules.map((rule) => [rule.ruleId, rule]))
      : null;
  const applied =
    expanded && details
      ? new Map(run.appliedTemporalRules.map((rule) => [rule.ruleId, rule]))
      : null;
  const comparisons = details?.comparisons ?? [];
  const comparedExplanation = details?.rankReason
    ? run.explanations.find(
        (item) =>
          item.candidateKey === details.rankReason?.comparisonCandidateKey,
      )
    : undefined;
  const quickFacts = comparisons
    .map((fact) => {
      const target = decimalFraction(fact.targetAmount);
      const beforeCoverage = coveragePercent(
        ratioFraction(fact.recordedAmount),
        target,
      );
      const afterCoverage = coveragePercent(
        ratioFraction(fact.projectedAmount),
        target,
      );
      const beforeGap = recordedGapPercent(fact);
      const afterGap = projectedGapPercent(fact);
      return {
        fact,
        beforeCoverage,
        afterCoverage,
        beforeGap,
        afterGap,
        improvement: beforeGap - afterGap,
      };
    })
    .sort(
      (left, right) =>
        right.improvement - left.improvement ||
        right.afterGap - left.afterGap ||
        left.fact.nutrientId.localeCompare(right.fact.nutrientId),
    );
  const decisiveFacts = quickFacts.slice(0, 3);
  const attention = [...quickFacts]
    .filter(({ afterGap }) => afterGap >= 5)
    .sort((left, right) => right.afterGap - left.afterGap)[0];
  const provisionalRuleCount = run.appliedTemporalRules.filter(
    (rule) => rule.decision === 'PROVISIONAL_SHORT_HISTORY',
  ).length;
  const evidenceMealCount = new Set(
    comparisons.flatMap((fact) => fact.acceptedMealIds),
  ).size;
  const exactPositionReason =
    details?.rankReason && comparedExplanation
      ? details.rankReason.relation === 'AHEAD_OF'
        ? `It ranked ahead of ${comparedExplanation.displayName} because it produced ${objectiveReason(details.rankReason.decisiveObjectiveId)}.`
        : `${comparedExplanation.displayName} ranked ahead because it produced ${objectiveReason(details.rankReason.decisiveObjectiveId)}.`
      : 'It is the only option with complete comparable evidence in this result.';
  return (
    <div className="mt-3 text-sm">
      <div className="flex flex-wrap gap-2" aria-label="Ranking summary">
        <span className="rounded-full bg-accent/10 px-3 py-1 font-semibold text-accent">
          #{row.rank} of {run.result.ranked.length}
        </span>
        <span className="rounded-full bg-background px-3 py-1 text-muted">
          {run.input.planningPolicy.horizonDays}-day outlook
        </span>
        <span className="rounded-full bg-background px-3 py-1 text-muted">
          {run.input.planningPolicy.robustScenarios.length} schedule scenario
          {run.input.planningPolicy.robustScenarios.length === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-background px-3 py-1 text-muted">
          {explanation.comparisonCount} nutrition target
          {explanation.comparisonCount === 1 ? '' : 's'}
        </span>
      </div>
      <details
        className="group mt-3 overflow-hidden rounded-2xl border border-separator bg-background/60"
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setExpanded(open);
          if (open) requestDetails().catch(() => undefined);
          else cancelExplanation();
        }}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold marker:content-none">
          <span>
            Why this rank?
            <span className="mt-1 block text-xs font-normal text-muted">
              A quick explanation first; calculation evidence stays optional.
            </span>
          </span>
          <span
            aria-hidden="true"
            className="text-lg text-accent transition group-open:rotate-45"
          >
            +
          </span>
        </summary>
        {expanded && loading ? (
          <p className="border-t border-separator p-4 text-muted" role="status">
            Loading detailed evidence…
          </p>
        ) : null}
        {expanded && loadError ? (
          <div
            className="border-t border-separator p-4 text-danger"
            role="alert"
          >
            <p>{loadError}</p>
            <button
              className="mt-2 rounded-lg border border-separator px-3 py-1 text-sm font-medium"
              onClick={() => {
                void requestDetails().catch(() => undefined);
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
        {expanded && details ? (
          <div className="border-t border-separator p-4 sm:p-5">
            <section className="overflow-hidden rounded-2xl border border-accent/20 bg-accent/5">
              <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
                <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-accent text-white shadow-sm">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Rank
                  </span>
                  <strong className="text-3xl leading-none">#{row.rank}</strong>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Decision summary
                  </p>
                  <h4 className="mt-1 text-xl font-semibold">
                    {row.rank === 1
                      ? 'Best overall fit for your next meal'
                      : `${row.rank - 1} stronger ${row.rank === 2 ? 'option ranks' : 'options rank'} ahead`}
                  </h4>
                  <p className="mt-2 text-muted">{exactPositionReason}</p>
                </div>
              </div>
              <div className="grid border-t border-accent/15 bg-background/50 sm:grid-cols-4">
                {[
                  ['1', 'Evidence', 'Comparable data'],
                  ['2', 'Constraints', 'Declared limits checked'],
                  [
                    '3',
                    'Future',
                    `${run.input.planningPolicy.horizonDays}-day simulation`,
                  ],
                  ['4', 'Decision', `Placed #${row.rank}`],
                ].map(([step, label, value]) => (
                  <div
                    className="flex gap-3 border-accent/15 p-3 sm:border-r sm:last:border-r-0"
                    key={step}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success">
                      {step}
                    </span>
                    <span>
                      <span className="block text-xs font-semibold">
                        {label}
                      </span>
                      <span className="block text-xs text-muted">{value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                    What this meal changes
                  </p>
                  <h4 className="mt-1 text-lg font-semibold">
                    Largest changes toward your current targets
                  </h4>
                </div>
                <span className="text-xs text-muted">
                  Showing {decisiveFacts.length} of {comparisons.length} targets
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {decisiveFacts.map(
                  ({ fact, beforeCoverage, afterCoverage, improvement }) => (
                    <article
                      className="rounded-2xl border border-separator bg-background/60 p-4"
                      key={fact.ruleId}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h5 className="font-semibold capitalize">
                          {nutrientName(fact.nutrientId)}
                        </h5>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            improvement > 0.5
                              ? 'bg-success/10 text-success'
                              : improvement < -0.5
                                ? 'bg-warning/10 text-warning'
                                : 'bg-background text-muted'
                          }`}
                        >
                          {improvement > 0.5
                            ? `Gap −${displayNumber(improvement)} pts`
                            : improvement < -0.5
                              ? `Gap +${displayNumber(Math.abs(improvement))} pts`
                              : 'Stable'}
                        </span>
                      </div>
                      <div className="mt-4 space-y-3">
                        <TargetProgress
                          label="Before this meal"
                          tone="before"
                          value={beforeCoverage}
                        />
                        <TargetProgress
                          label="After this meal"
                          tone="after"
                          value={afterCoverage}
                        />
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        {decimal(fact.recordedAmount)} →{' '}
                        {decimal(fact.projectedAmount)} {fact.unit.code}; target{' '}
                        {fact.targetAmount} {fact.unit.code}.
                      </p>
                    </article>
                  ),
                )}
              </div>
            </section>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-separator p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                  Replanning
                </p>
                <h5 className="mt-1 font-semibold">What happens next</h5>
                <p className="mt-2 text-muted">
                  If you choose and record this meal, Nutrixx will recalculate
                  from your updated intake before suggesting another meal.
                </p>
              </div>
              <div className="rounded-2xl border border-separator p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-warning">
                  Remaining gap
                </p>
                <h5 className="mt-1 font-semibold">
                  What still needs attention
                </h5>
                <p className="mt-2 text-muted">
                  {attention
                    ? `${nutrientName(attention.fact.nutrientId)} remains ${displayNumber(
                        attention.afterGap,
                      )}% away from its comparison target. Later meals can continue closing that gap.`
                    : 'This portion reaches or stays close to every nutrition target used in this comparison.'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className="rounded-xl bg-warning/10 p-3 text-xs text-muted">
                This result assumes your food, drink, and supplement log is
                complete. It describes recorded dietary intake, not nutrient
                levels inside your body.
              </p>
              <span
                className={`rounded-full px-3 py-2 text-center text-xs font-semibold ${
                  provisionalRuleCount > 0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-success/10 text-success'
                }`}
              >
                {provisionalRuleCount > 0
                  ? `${provisionalRuleCount} target${provisionalRuleCount === 1 ? '' : 's'} still building history`
                  : 'Configured history available'}
              </span>
            </div>

            <details className="group/evidence mt-4 overflow-hidden rounded-2xl border border-separator bg-background/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:content-none sm:p-5">
                <span>
                  <span className="block font-semibold">
                    Technical evidence and sources
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    Reproduce the calculation without reading raw data all at
                    once.
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="hidden rounded-full bg-surface px-2 py-1 text-xs text-muted sm:inline">
                    {comparisons.length} target
                    {comparisons.length === 1 ? '' : 's'}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg text-accent transition group-open/evidence:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <div className="border-t border-separator p-4 sm:p-5">
                <div className="grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-medium">Audit trail</p>
                    <p className="mt-1 text-xs text-muted">
                      Every value below comes from the frozen planning input and
                      validated engine output. Times are UTC and window ends are
                      exclusive.
                    </p>
                  </div>
                  <div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-right">
                      <div>
                        <dt className="text-muted">Combined gap</dt>
                        <dd className="font-semibold">{decimal(row.score)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Meals used</dt>
                        <dd className="font-semibold">{evidenceMealCount}</dd>
                      </div>
                    </dl>
                    <button
                      className="mt-3 w-full rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent disabled:cursor-wait disabled:opacity-60"
                      disabled={reportState === 'CREATING'}
                      onClick={() => {
                        downloadEvidenceReport().catch(() => undefined);
                      }}
                      type="button"
                    >
                      {reportState === 'CREATING'
                        ? 'Sealing report…'
                        : 'Download audit report (.json)'}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  The combined gap orders candidates; it is not a health score.
                </p>
                <p aria-live="polite" className="mt-1 text-xs text-muted">
                  {reportState === 'DOWNLOADED'
                    ? 'Downloaded with an RFC 8785 canonical SHA-256 seal.'
                    : reportState === 'FAILED'
                      ? 'The evidence report could not be created. Retry from this unchanged result.'
                      : 'The report is created locally and includes an integrity seal.'}
                </p>

                <div className="mt-4 space-y-2">
                  {comparisons.map((fact) => {
                    const policy = policies?.get(fact.ruleId);
                    const scoredRule = scoredRules?.get(fact.ruleId);
                    const span = applied?.get(fact.ruleId);
                    const composition =
                      candidate?.nutrientsPer100EdibleGrams.find(
                        (item) => item.nutrientId === fact.nutrientId,
                      );
                    const graphNodes = [
                      {
                        id: `${fact.ruleId}:recorded`,
                        stage: 'INPUT',
                        label: 'Recorded intake',
                        value: `${decimal(fact.recordedAmount)} ${fact.unit.code}`,
                        source: `${fact.acceptedMealIds.length} accepted meal record${fact.acceptedMealIds.length === 1 ? '' : 's'} inside this rule window.`,
                        derivation:
                          'The engine summed recognized intake from the accepted meal records.',
                      },
                      {
                        id: `${fact.ruleId}:composition`,
                        stage: 'INPUT',
                        label: 'Food composition',
                        value:
                          composition?.state === 'known' &&
                          composition.amountPer100EdibleGrams &&
                          composition.unit?.code
                            ? `${composition.amountPer100EdibleGrams} ${composition.unit.code} / 100 g`
                            : 'Unavailable',
                        source:
                          composition?.state === 'known'
                            ? `${composition.source.kind} source ${composition.source.sourceId}`
                            : 'No known composition observation in the display evidence.',
                        derivation:
                          'The selected edible portion scales this per-100-gram observation.',
                      },
                      {
                        id: `${fact.ruleId}:portion`,
                        stage: 'INPUT',
                        label: 'Suggested portion',
                        value: `${details.edibleGrams ?? 'Unknown'} g`,
                        source:
                          'Validated selected portion in the frozen explanation.',
                        derivation:
                          'The portion converts the food composition into this meal’s nutrient contribution.',
                      },
                      {
                        id: `${fact.ruleId}:weight`,
                        stage: 'INPUT',
                        label: 'Rule weight',
                        value: String(scoredRule?.weight ?? 'Unavailable'),
                        source: policy
                          ? `Temporal policy rule ${policy.ruleId}, version ${policy.ruleVersion}.`
                          : 'The frozen temporal policy is unavailable.',
                        derivation:
                          'The policy weight determines this rule’s contribution to the combined gap.',
                      },
                      {
                        id: `${fact.ruleId}:projected`,
                        stage: 'CALCULATION',
                        label: 'Projected intake',
                        value: `${decimal(fact.projectedAmount)} ${fact.unit.code}`,
                        source: 'Deterministic optimizer calculation.',
                        derivation:
                          'Recorded intake plus the nutrient contribution from the suggested portion.',
                      },
                      {
                        id: `${fact.ruleId}:target`,
                        stage: 'CALCULATION',
                        label: 'Comparison target',
                        value: `${fact.targetAmount} ${fact.unit.code}`,
                        source: policy
                          ? `${policy.reference.citation.authority}, ${policy.reference.citation.title}.`
                          : `${fact.referenceType}, release ${fact.referenceReleaseId}.`,
                        derivation: `Applied as a ${fact.targetMode.replaceAll('-', ' ')} target for this rule.`,
                      },
                      {
                        id: `${fact.ruleId}:gap`,
                        stage: 'CALCULATION',
                        label: 'Remaining gap',
                        value: `${displayNumber(projectedGapPercent(fact))}%`,
                        source:
                          'Exact normalized-distance output from the optimizer.',
                        derivation:
                          'The projected amount is compared with the target under the rule’s target mode.',
                      },
                      {
                        id: `${fact.ruleId}:rank`,
                        stage: 'OUTCOME',
                        label: 'Candidate ranking',
                        value: `#${row.rank} · combined gap ${decimal(row.score)}`,
                        source:
                          'Independently validated hierarchical ranking output.',
                        derivation: exactPositionReason,
                      },
                    ] satisfies ProvenanceGraphNodeV1[];
                    return (
                      <details
                        className="group/fact overflow-hidden rounded-xl border border-separator bg-background/60"
                        key={fact.ruleId}
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:content-none sm:p-4">
                          <span>
                            <span className="block font-semibold capitalize">
                              {nutrientName(fact.nutrientId)}
                            </span>
                            <span className="mt-1 block text-xs text-muted">
                              {decimal(fact.recordedAmount)} →{' '}
                              {decimal(fact.projectedAmount)} {fact.unit.code} ·{' '}
                              {displayNumber(projectedGapPercent(fact))}% gap
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${
                                span?.decision === 'PROVISIONAL_SHORT_HISTORY'
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-success/10 text-success'
                              }`}
                            >
                              {span?.decision === 'PROVISIONAL_SHORT_HISTORY'
                                ? 'Short history'
                                : 'Full window'}
                            </span>
                            <span
                              aria-hidden="true"
                              className="text-accent transition group-open/fact:rotate-45"
                            >
                              +
                            </span>
                          </span>
                        </summary>

                        <div className="border-t border-separator p-3 sm:p-4">
                          <section>
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-accent">
                              Calculation
                            </h5>
                            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                              {[
                                [
                                  'Recorded',
                                  `${decimal(fact.recordedAmount)} ${fact.unit.code}`,
                                ],
                                [
                                  'After meal',
                                  `${decimal(fact.projectedAmount)} ${fact.unit.code}`,
                                ],
                                [
                                  'Target',
                                  `${fact.targetAmount} ${fact.unit.code}`,
                                ],
                                [
                                  'Remaining gap',
                                  `${displayNumber(projectedGapPercent(fact))}%`,
                                ],
                                ['Rule weight', scoredRule?.weight ?? '—'],
                              ].map(([label, value]) => (
                                <div
                                  className="rounded-lg bg-surface p-2"
                                  key={label}
                                >
                                  <dt className="text-xs text-muted">
                                    {label}
                                  </dt>
                                  <dd className="mt-1 font-semibold">
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                            <p className="mt-2 text-xs text-muted">
                              {fact.targetMode.replaceAll('-', ' ')} target ·{' '}
                              {fact.referenceType.replaceAll('-', ' ')}
                            </p>
                          </section>

                          <section className="mt-4 border-t border-separator pt-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-accent">
                              Provenance graph
                            </h5>
                            <p className="mt-1 text-xs text-muted">
                              Select any value to see its origin and how the
                              engine used it.
                            </p>
                            <div className="mt-3">
                              <NextMealProvenanceGraph nodes={graphNodes} />
                            </div>
                          </section>

                          <section className="mt-4 border-t border-separator pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h5 className="text-xs font-semibold uppercase tracking-wider text-accent">
                                Time and recorded meals
                              </h5>
                              <span className="text-xs text-muted">
                                {fact.acceptedMealIds.length} meal
                                {fact.acceptedMealIds.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-muted">
                              <time dateTime={fact.windowStartInclusive}>
                                {utc(fact.windowStartInclusive)}
                              </time>{' '}
                              →{' '}
                              <time dateTime={fact.windowEndExclusive}>
                                {utc(fact.windowEndExclusive)}
                              </time>
                            </p>
                            {span?.decision === 'PROVISIONAL_SHORT_HISTORY' ? (
                              <p className="mt-2 rounded-lg bg-warning/10 p-2 text-xs text-muted">
                                Tracking history is shorter than the configured
                                window, which starts at{' '}
                                <time
                                  dateTime={span.configuredWindowStartInclusive}
                                >
                                  {utc(span.configuredWindowStartInclusive)}
                                </time>
                                .
                              </p>
                            ) : (
                              <p className="mt-2 rounded-lg bg-success/10 p-2 text-xs text-muted">
                                The configured history window was available.
                                Complete logging remains your stated-data
                                assumption.
                              </p>
                            )}
                            {fact.acceptedMealIds.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {fact.acceptedMealIds.map((mealId, index) => (
                                  <Link
                                    className="rounded-full border border-separator px-2 py-1 text-xs underline"
                                    href={`/meals/${mealId}`}
                                    key={mealId}
                                  >
                                    Recorded meal {index + 1}
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                          </section>

                          <section className="mt-4 border-t border-separator pt-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-accent">
                              Sources and limits
                            </h5>
                            {policy ? (
                              <div className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
                                <div className="rounded-lg bg-surface p-3">
                                  <Citation
                                    citation={policy.reference.citation}
                                    purpose="Target reference"
                                  />
                                </div>
                                <div className="rounded-lg bg-surface p-3">
                                  <Citation
                                    citation={policy.horizonCitation}
                                    purpose="Time-window reference"
                                  />
                                </div>
                                <p className="rounded-lg bg-surface p-3 sm:col-span-2">
                                  Application limit: {policy.limitations}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-danger">
                                The frozen temporal policy is unavailable for
                                this rule.
                              </p>
                            )}
                            {composition?.state === 'known' ? (
                              <p className="mt-2 rounded-lg bg-surface p-3 text-xs text-muted">
                                Food composition: {composition.source.kind}{' '}
                                source {composition.source.sourceId}
                                {composition.source.sourceVersion
                                  ? `, version ${composition.source.sourceVersion}`
                                  : ''}
                                {composition.source.sourceRecordId
                                  ? `, record ${composition.source.sourceRecordId}`
                                  : ''}
                                .
                              </p>
                            ) : null}
                          </section>

                          <details className="mt-4 text-xs text-muted">
                            <summary className="cursor-pointer font-medium">
                              Raw audit identifiers
                            </summary>
                            <dl className="mt-2 grid gap-1 rounded-lg bg-surface p-3 font-mono">
                              <div>
                                <dt className="inline font-sans">Rule: </dt>
                                <dd className="inline">
                                  {policy?.ruleId ?? fact.ruleId}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline font-sans">Version: </dt>
                                <dd className="inline">
                                  {policy?.ruleVersion ?? 'unavailable'}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline font-sans">
                                  Reference release:{' '}
                                </dt>
                                <dd className="inline">
                                  {fact.referenceReleaseId}
                                </dd>
                              </div>
                            </dl>
                          </details>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
        ) : null}
      </details>
    </div>
  );
}
