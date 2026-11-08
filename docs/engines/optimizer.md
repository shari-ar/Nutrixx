# Optimizer and recommendation engine

| Field         | Value                                             |
| ------------- | ------------------------------------------------- |
| Status        | Active normative design                           |
| Audience      | Optimization, nutrition science, product, quality |
| Owner         | Nutrixx Optimization Engineering                  |
| Last reviewed | 2026-11-07                                        |

## Contract

The recommendation engine receives one immutable, eligible next-meal context
and returns a complete, classified local-catalog ranking. The normative product
semantics are defined by [next-meal planning](next-meal-planning.md): recorded
history supplies the dietary state, rolling-horizon continuation protects
against a myopic next action, and only the next-meal ranking is published. The
application supplies immutable state and publishes validated results to the
user.

```text
NextMealContextSnapshot
→ Eligibility
→ Full local catalog census
→ Candidate classification + hard-rule validation
→ Evidence-qualified portion and continuation evaluation
→ Deterministic ranking
→ Independent result validation
→ Explanation + freshness gate
→ Ranked next-meal options
→ User selection → explicit consumption confirmation
```

Free result statuses are READY, PARTIAL, NEEDS_INPUT, INFEASIBLE,
SEARCH_LIMIT, OUT_OF_SCOPE, CANCELLED, and ERROR. READY indicates a complete
catalog census with validated ranking. PARTIAL includes measured coverage and
the remaining evaluation count. SEARCH_LIMIT records a bounded run that ended
before a complete validated ranking.

## Capability profiles

| Profile                 | Eligibility                 | Boundary                                                                                                                  |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Free local approximate  | Free, on a supported device | Complete next-meal catalog classification and evidence-qualified local ranking under a measured device envelope           |
| Pro full optimizer      | Pro entitlement             | Complete eligible cloud optimization contract without requiring the user's API key                                        |
| Ultimate full optimizer | Ultimate entitlement        | Same scientific/safety contract as Pro; higher hosted-AI capture allowances and assistant access preserve full validation |

Experimental Local Processing may help parse input into a draft. The full paid
optimizer and optimizer authority require their dedicated entitlement.
Entitlement differences affect available compute/capabilities while safety
constraints and nutrient meanings remain universal.

The accepted Stage 4 Free implementation milestone is specified by
[history-aware constraints](../decisions/ADR-0016-history-aware-next-meal-constraints.md),
[complete ranking and replay](../decisions/ADR-0017-complete-local-next-meal-ranking.md),
[next-meal lifecycle and inventory](../decisions/ADR-0018-next-meal-lifecycle-and-inventory.md),
and the [capability and quality floor](../decisions/ADR-0019-free-next-meal-quality-floor.md).
These ADRs define the current local implementation boundary within the
normative next-meal design. The
[Free next-meal contract](next-meal-contract.md) specifies its typed boundary,
outcomes, invariants, and replay.

The [Planning domain model](planning-domain-model.md) defines the internal,
solver-neutral State → Action → Constraint → Objective → Outcome chain shared by
current and future execution strategies.

## Rolling-horizon planning context

The complete optimizer snapshot includes horizon/meal slots, nutrition state, applicable target
and safety policy, foods/recipes and exact revisions, portions/availability,
allergens/restrictions, preferences, culture/cuisine, budget, preparation time,
inventory/waste when supported, prior-plan stability, forecast assumptions,
terminal-state policy, and all data quality limitations. Capability tiers may
change where computation runs and which validated models are available; they
preserve the meaning of Nutrixx's next-meal decision.

## Optimization model

A mixed-integer linear model is the proposed baseline for discrete food choices,
portion increments, and meal assignments. Every comparable candidate is tested
as the first action of a feasible continuation over the configured horizon. Its
ranking value reflects the best validated continuation it enables, while only
the first action is published. A terminal value prevents objectives from being
artificially postponed beyond the finite horizon. A solver adapter keeps domain
semantics independent of a vendor.

The active local policy uses a deterministic bounded continuation portfolio to
keep full-catalog work practical in a browser. It evaluates a three-day horizon
with three modeled opportunities per day, multiple continuation seeds and both
an expected schedule and a one-opportunity-loss scenario. Exact rational
arithmetic and a fixed policy make the result reproducible. This search makes
no unsupported global-optimality claim; a future solver adapter may expand the
search while preserving the same contract and objective hierarchy.

### Hard constraints

- declared allergies and accepted safety exclusions;
- intended-use and eligibility policy;
- dimensionally valid and permitted portion bounds;
- source availability and explicitly immutable user prohibitions;
- scientifically approved hard limits;
- internal consistency of servings, slots, and horizon.

Hard constraints retain precedence over score. When infeasible, the
result identifies a minimal/useful conflict set where the solver permits it.

### Hierarchical soft objectives

1. minimize policy-defined nutrient deviation;
2. respect strong preferences and practical schedule;
3. minimize cost and preparation burden;
4. improve diversity and cuisine fit;
5. reduce waste and unnecessary change from the prior plan.

Weights, normalization, priority tiers, and tie-breakers are versioned policy.
A combined score ranks alternatives and is presented exclusively as a
plan-comparison score rather than a probability of success.

## Predictions

Predictions are independent modules with a declared outcome, horizon,
population, baseline, model/data version, interval, and validation evidence.
Safety limits and user goals change through their dedicated authorized
workflows. Models enter production after evaluation/shadow validation.

Paid AI modules may recognize preference patterns, predict adherence, extract
typed context and explain a validated result. Preference and adherence outputs
enter only declared soft-objective channels. Extracted facts remain drafts, and
generated explanations resolve exclusively to validated trace evidence. The
deterministic optimizer retains authority over feasibility, safety, nutrient
arithmetic, objective hierarchy and ranking. These paid modules are documented
target capabilities scheduled for a paid-plan delivery stage. The current local
planner remains deterministic and fully functional without these modules.

## Determinism and replay

Each run retains:

```text
run_id
input/context snapshot and candidate ordering
food data + scientific rule releases
engine/model/solver versions
solver parameters, seed, limits, and optimality gap
all candidates or required replay artifacts
validation report
output hash
```

A seed forms one part of the execution fingerprint. For equivalent-feasibility
replay, the exact accepted result and validation evidence are retained.

## Independent validation

The post-solve validator is implemented separately from objective construction.
It recomputes amounts and verifies hard constraints, eligibility, food/recipe
revisions, unit consistency, serving bounds, and plan totals.

After prediction and explanation generation, a separate claims validator checks
that every number and material claim resolves to validated typed output, that
each model is applicable to the current request, and that language remains
inside the intended-use boundary.

Immediately before publication, the system atomically verifies that the
eligibility, consent, allergy/restriction, context, active safety-policy, and
dataset revisions used by the run are still current. A stale run is invalidated
and safely recomputed or returned as NEEDS_INPUT; publication uses current,
validated results. Cache reads and user substitutions pass the same validation and freshness
gates.

A failed validation quarantines the result, records diagnostics, emits an
operational signal, and shows no plan.

## Explanation

Every plan exposes:

- decisive constraints and reasons for selected foods/portions;
- nutrient target distance and remaining unmet objectives;
- meaningful trade-offs versus alternatives;
- assumptions, missing data, and quality limitations;
- solver status and non-optimality where material;
- independently validated substitutions.

If generative AI is introduced, it may parse user language or verbalize a
validated trace. Typed domain engines retain authority over nutrient values,
targets, safety, substitutions, and every presented number.

## Evaluation

Release gates cover hard-constraint violations, feasibility/infeasibility
diagnostics, target deviation, stability, diversity, cultural/catalog coverage,
latency p50/p95, optimality gap, explanation fidelity, user acceptance and
correction rates, and subgroup analysis. See
[verification and evaluation](../quality/verification-and-evaluation.md).
