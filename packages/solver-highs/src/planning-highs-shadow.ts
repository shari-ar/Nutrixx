import highsLoaderModule, { type Highs } from 'highs';

import {
  PlanningDecisionChainV1Schema,
  validatePlanningDecisionChainV1,
  type PlanningActionOutcomeV1,
  type PlanningDecisionChainV1,
  type PlanningObjectiveV1,
} from '@nutrixx/optimizer-engine';

export const HIGHS_SHADOW_MODEL_VERSION_V1 =
  'planning-highs-binary-selection-v1' as const;
export const HIGHS_SHADOW_SOLVER_VERSION_V1 =
  'next-meal-highs-milp-shadow-v1+highs-js-1.15.4' as const;

export type HighsShadowDigestV1 = (value: string) => Promise<string>;
export type HighsShadowRuntimeV1 = Pick<Highs, 'solve' | 'version'>;

export interface HighsShadowExecutionV1 {
  readonly modelKind: 'MILP';
  readonly engine: 'HIGHS';
  readonly engineVersion: string;
  readonly modelVersion: typeof HIGHS_SHADOW_MODEL_VERSION_V1;
  readonly modelSha256: string;
  readonly status: 'OPTIMAL';
  readonly variableCount: number;
  readonly constraintCount: number;
  readonly selectedActionId: string;
  readonly objectiveValue: string;
  readonly mipGap: { readonly numerator: '0'; readonly denominator: '1' };
}

export interface HighsShadowResultV1 {
  readonly chain: PlanningDecisionChainV1;
  readonly execution: HighsShadowExecutionV1;
}

type Fraction = readonly [numerator: bigint, denominator: bigint];

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (denominator <= 0n)
    throw new TypeError('An exact planning denominator must be positive.');
  const divisor = greatestCommonDivisor(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function decimal(value: string): Fraction {
  const [whole = '0', digits = ''] = value.split('.');
  return fraction(BigInt(`${whole}${digits}`), 10n ** BigInt(digits.length));
}

function multiply(left: Fraction, right: Fraction): Fraction {
  return fraction(left[0] * right[0], left[1] * right[1]);
}

function compareFraction(left: Fraction, right: Fraction): number {
  const difference = left[0] * right[1] - right[0] * left[1];
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function aggregateValue(
  outcome: PlanningActionOutcomeV1,
  objective: PlanningObjectiveV1,
): Fraction {
  const result = outcome.objectiveResults.find(
    (item) =>
      item.objectiveId === objective.objectiveId &&
      item.scenarioId === undefined,
  );
  if (!result)
    throw new TypeError(
      `Action ${outcome.actionId} lacks aggregate objective ${objective.objectiveId}.`,
    );
  return multiply(
    fraction(BigInt(result.value.numerator), BigInt(result.value.denominator)),
    decimal(objective.weight),
  );
}

function compareActions(
  left: PlanningActionOutcomeV1,
  right: PlanningActionOutcomeV1,
  objectives: readonly PlanningObjectiveV1[],
): number {
  for (const objective of objectives) {
    const comparison = compareFraction(
      aggregateValue(left, objective),
      aggregateValue(right, objective),
    );
    if (comparison !== 0)
      return objective.direction === 'MINIMIZE' ? comparison : -comparison;
  }
  return left.actionId.localeCompare(right.actionId);
}

function wrapTerms(terms: readonly string[]): string {
  const lines: string[] = [];
  for (let index = 0; index < terms.length; index += 24)
    lines.push(terms.slice(index, index + 24).join(' + '));
  return lines.join('\n + ');
}

function wrapNames(names: readonly string[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < names.length; index += 24)
    lines.push(` ${names.slice(index, index + 24).join(' ')}`);
  return lines;
}

interface LockedObjective {
  readonly coefficients: readonly number[];
  readonly optimum: number;
}

function objectiveCoefficients(
  outcomes: readonly PlanningActionOutcomeV1[],
  objective: PlanningObjectiveV1,
): number[] {
  const ordered = outcomes
    .map((outcome, index) => ({
      index,
      value: aggregateValue(outcome, objective),
    }))
    .sort((left, right) => {
      const comparison = compareFraction(left.value, right.value);
      return objective.direction === 'MINIMIZE' ? comparison : -comparison;
    });
  const coefficients = Array<number>(outcomes.length);
  let group = -1;
  let previous: Fraction | undefined;
  for (const item of ordered) {
    if (!previous || compareFraction(item.value, previous) !== 0) group += 1;
    coefficients[item.index] = group;
    previous = item.value;
  }
  return coefficients;
}

function buildBinarySelectionModel(
  objective: readonly number[],
  locked: readonly LockedObjective[],
): string {
  const variableCount = objective.length;
  const variables = Array.from(
    { length: variableCount },
    (_, index) => `x${index}`,
  );
  const objectiveTerms = variables.map(
    (variable, index) => `${objective[index] ?? 0} ${variable}`,
  );
  return [
    'Minimize',
    ` shadow_objective: ${wrapTerms(objectiveTerms)}`,
    'Subject To',
    ` choose_one: ${wrapTerms(variables)} = 1`,
    ...locked.map(
      ({ coefficients, optimum }, lockIndex) =>
        ` lock_${lockIndex}: ${wrapTerms(
          variables.map(
            (variable, index) => `${coefficients[index] ?? 0} ${variable}`,
          ),
        )} = ${optimum}`,
    ),
    'Bounds',
    ...variables.map((variable) => ` 0 <= ${variable} <= 1`),
    'Binaries',
    ...wrapNames(variables),
    'End',
    '',
  ].join('\n');
}

async function defaultRuntime(): Promise<HighsShadowRuntimeV1> {
  const browserLocation = globalThis.location;
  type Loader = (options?: {
    readonly locateFile?: (file: string) => string;
  }) => Promise<Highs>;
  const moduleValue = highsLoaderModule as unknown as {
    readonly default?: Loader;
  };
  const loadHighs =
    moduleValue.default ?? (highsLoaderModule as unknown as Loader);
  return loadHighs(
    browserLocation
      ? {
          locateFile: (file: string) =>
            file.endsWith('.wasm')
              ? new URL('/solver-assets/highs.wasm', browserLocation.origin)
                  .href
              : file,
        }
      : undefined,
  );
}

/** Solves the next-action selection as an independent binary MILP. */
export async function solvePlanningHighsShadowV1(input: {
  readonly primaryChain: unknown;
  readonly digest: HighsShadowDigestV1;
  readonly loadRuntime?: () => Promise<HighsShadowRuntimeV1>;
}): Promise<HighsShadowResultV1> {
  const primary = PlanningDecisionChainV1Schema.parse(input.primaryChain);
  if (validatePlanningDecisionChainV1(primary).status !== 'APPROVED')
    throw new TypeError('The MILP shadow requires an approved Decision Chain.');
  const objectives = primary.problem.objectives
    .filter(({ activation }) => activation.status === 'ACTIVE')
    .sort(
      (left, right) =>
        left.priorityTier - right.priorityTier ||
        left.orderWithinTier - right.orderWithinTier,
    );
  const feasible = primary.outcome.actionOutcomes
    .filter(
      (outcome) =>
        outcome.classification === 'FEASIBLE' &&
        outcome.constraintResults.every(({ status }) => status === 'PASSED'),
    )
    .sort((left, right) => compareActions(left, right, objectives));
  if (primary.outcome.status !== 'READY' || feasible.length === 0)
    throw new TypeError(
      'The MILP shadow requires a ready feasible action set.',
    );

  const runtime = await (input.loadRuntime ?? defaultRuntime)();
  const discriminatingObjectives = objectives
    .map((objective) => objectiveCoefficients(feasible, objective))
    .filter((coefficients) => coefficients.some((value) => value !== 0));
  const tieBreakRanks = new Map(
    [...feasible]
      .sort((left, right) => left.actionId.localeCompare(right.actionId))
      .map(({ actionId }, index) => [actionId, index] as const),
  );
  const tieBreak = feasible.map(
    ({ actionId }) => tieBreakRanks.get(actionId) ?? feasible.length,
  );
  const stages = [...discriminatingObjectives, tieBreak];
  const locked: LockedObjective[] = [];
  const models: string[] = [];
  let solution: ReturnType<HighsShadowRuntimeV1['solve']> | undefined;
  for (const stage of stages) {
    const model = buildBinarySelectionModel(stage, locked);
    models.push(model);
    solution = runtime.solve(model, {
      output_flag: false,
      presolve: 'on',
      random_seed: 0,
      threads: 1,
      time_limit: 30,
      mip_rel_gap: 0,
    });
    if (solution.Status !== 'Optimal')
      throw new TypeError(`HiGHS MILP ended with status ${solution.Status}.`);
    locked.push({
      coefficients: stage,
      optimum: Math.round(solution.ObjectiveValue),
    });
  }
  if (!solution)
    throw new TypeError('The MILP shadow produced no solve stage.');
  if (solution.Status !== 'Optimal')
    throw new TypeError(`HiGHS MILP ended with status ${solution.Status}.`);
  const selectedIndexes = feasible.flatMap((_, index) =>
    (solution.Columns[`x${index}`]?.Primal ?? 0) > 0.5 ? [index] : [],
  );
  if (selectedIndexes.length !== 1 || selectedIndexes[0] !== 0)
    throw new TypeError(
      'HiGHS MILP selection diverged from the exact lexicographic model.',
    );

  const ranks = new Map(
    feasible.map(({ actionId }, index) => [actionId, index + 1] as const),
  );
  const selected = feasible[0]!;
  const chain = PlanningDecisionChainV1Schema.parse({
    ...primary,
    outcome: {
      ...primary.outcome,
      recommendedActionId: selected.actionId,
      actionOutcomes: primary.outcome.actionOutcomes.map((outcome) =>
        outcome.classification === 'FEASIBLE'
          ? { ...outcome, rank: ranks.get(outcome.actionId) }
          : outcome,
      ),
    },
  });
  if (validatePlanningDecisionChainV1(chain).status !== 'APPROVED')
    throw new TypeError('The HiGHS shadow Decision Chain failed validation.');

  return {
    chain,
    execution: {
      modelKind: 'MILP',
      engine: 'HIGHS',
      engineVersion: runtime.version.string,
      modelVersion: HIGHS_SHADOW_MODEL_VERSION_V1,
      modelSha256: await input.digest(models.join('\n-- next-stage --\n')),
      status: 'OPTIMAL',
      variableCount: feasible.length,
      constraintCount: stages.length,
      selectedActionId: selected.actionId,
      objectiveValue: String(Math.round(solution.ObjectiveValue)),
      mipGap: { numerator: '0', denominator: '1' },
    },
  };
}
