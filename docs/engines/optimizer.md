# Optimizer and recommendation engine

| Field         | Value                                             |
| ------------- | ------------------------------------------------- |
| Status        | Proposed target design                            |
| Audience      | Optimization, nutrition science, product, quality |
| Owner         | Nutrixx Optimization Engineering                  |
| Last reviewed | 2026-09-27                                        |

## Contract

The optimizer receives one immutable, eligible planning context and returns a
typed result. The application supplies immutable state and publishes validated
results to the user.

```text
ContextSnapshot
→ Eligibility
→ CandidateSet
→ HardConstraints
→ Feasibility
→ SoftObjectives
→ Solve
→ IndependentResultValidation
→ Predictions
→ Rank + Explain
→ ClaimValidation + FreshnessGate
→ PlanDraft
```

Possible statuses are READY, NEEDS_INPUT, INFEASIBLE, OUT_OF_SCOPE, and ERROR.
FEASIBLE and OPTIMAL are separate solver outcomes.

## Capability profiles

| Profile                 | Eligibility                 | Boundary                                                                                                                        |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Free local approximate  | Free, on a supported device | Deterministic bounded candidate set and approved local heuristics; no hosted inference and no AI-dependent optimizer capability |
| Pro full optimizer      | Pro entitlement             | Complete eligible cloud optimization contract without requiring the user's API key                                              |
| Ultimate full optimizer | Ultimate entitlement        | Same scientific/safety contract as Pro; higher hosted-AI capture allowances and assistant access preserve full validation       |

Experimental Local Processing may help parse input into a draft. The full paid
optimizer and optimizer authority require their dedicated entitlement.
Entitlement differences affect available compute/capabilities while safety
constraints and nutrient meanings remain universal.

## Planning context

The snapshot includes horizon/meal slots, nutrition state, applicable target
and safety policy, foods/recipes and exact revisions, portions/availability,
allergens/restrictions, preferences, culture/cuisine, budget, preparation time,
inventory/waste when supported, prior-plan stability, and all data quality
limitations.

## Optimization model

A mixed-integer linear model is the proposed baseline for discrete food choices,
portion increments, and meal assignments. A solver adapter keeps domain
semantics independent of a vendor.

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
