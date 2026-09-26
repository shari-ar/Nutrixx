# Verification and evaluation strategy

| Field         | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Status        | Proposed target strategy                                 |
| Audience      | Engineering, quality, nutrition science, product, safety |
| Owner         | Nutrixx Quality                                          |
| Last reviewed | 2026-09-22                                               |

## Test layers

| Layer                  | Required evidence                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Static                 | Types, lint, formatting, dependency/architecture rules, schema validation, secret/security scans                                          |
| Unit                   | Pure domain and engine examples, boundaries, invalid inputs, deterministic fingerprints                                                   |
| Property/metamorphic   | Unit conversion round trips, portion scaling, order invariance, non-negative valid quantities, monotonic cases where scientifically valid |
| Golden scientific      | Expert-approved food, recipe, target, state, and plan fixtures with defined tolerances                                                    |
| Contract               | OpenAPI lint/bundle, schema compatibility, generated-client/provider tests, problem semantics                                             |
| Integration            | Database transactions/outbox, queue idempotency, authz, import quarantine, version activation/rollback                                    |
| End to end             | Critical user journeys including correction, offline/failure states, accessibility                                                        |
| Differential           | Compare engine/data/rule releases and investigate material change                                                                         |
| Performance/resilience | Reference load, solve budgets, retry/timeout/circuit behavior, dependency and restore failure drills                                      |
| Security/privacy       | ASVS evidence, threat-based tests, access isolation, log/telemetry scans, export/deletion                                                 |

## Nutrition engine gates

Golden cases cover canonical units, servings, edible portion, raw/cooked state,
recipe yield/retention, rounding boundaries, missing versus zero, detection
limits, target applicability, source-specific upper limits, timezone/day
boundaries, and corrections.

Numerical tolerances are defined per calculation and never widened merely to
make a test pass.

## Optimizer gates

| Dimension    | Measures                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Safety       | Escaped hard violations must be zero in mandatory suites; blocked-safe and unsafe-pass rates tracked separately |
| Validity     | Independently recalculated totals, units, portion/slot consistency                                              |
| Feasibility  | Valid solution rate and correct INFEASIBLE/NEEDS_INPUT diagnosis                                                |
| Nutrition    | Deviation from policy objectives; unmet targets and upper-limit margin                                          |
| Practicality | Variety, cuisine/catalog coverage, budget/time adherence, plan stability                                        |
| Solver       | Status, optimality gap, solve time p50/p95, timeout and replay behavior                                         |
| Explanation  | Every numeric/causal claim resolves to the validated trace                                                      |
| Equity       | Metrics stratified by supported cuisine, catalog coverage, and relevant evaluated population groups             |

No single aggregate score can hide a safety or subgroup regression.

## Prediction/model gates

A predictive model is released only with a documented intended use, training
and evaluation data, leakage controls, person- and time-separated holdout,
baseline comparison, MAE/appropriate error, calibration/interval coverage,
subgroup bias analysis, robustness, drift signals, rollback, and human/safety
oversight.

Unvalidated models run in offline or shadow mode. NIST AI RMF
Govern–Map–Measure–Manage is used when AI/ML materially affects user outcomes.

## Evaluation data governance

Datasets have provenance, licence, purpose, version, inclusion/exclusion logic,
quality analysis, sensitive-data controls, contamination prevention, and an
owner. Release benchmarks are immutable and access-controlled. User data is not
used for model training or unrelated evaluation without an approved purpose
and consent/legal basis.

## Release decision

The candidate produces a signed evidence bundle containing requirement
coverage, test/evaluation results, scientific/data versions, known limitations,
security/privacy evidence, performance environment, exceptions with expiry,
approvers, and rollback target.

Reference: [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework).
