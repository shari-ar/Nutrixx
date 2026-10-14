# Verification and evaluation strategy

| Field         | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Status        | Proposed target strategy                                 |
| Audience      | Engineering, quality, nutrition science, product, safety |
| Owner         | Nutrixx Quality                                          |
| Last reviewed | 2026-10-14                                               |

## Test layers

| Layer                  | Required evidence                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static                 | Types, lint, formatting, dependency/architecture rules, schema validation, secret/security scans                                                       |
| Unit                   | Pure domain and engine examples, boundaries, invalid inputs, deterministic fingerprints                                                                |
| Property/metamorphic   | Unit conversion round trips, portion scaling, order invariance, non-negative valid quantities, monotonic cases where scientifically valid              |
| Golden scientific      | Expert-approved food, recipe, target, state, and plan fixtures with defined tolerances                                                                 |
| Contract               | OpenAPI lint/bundle, schema compatibility, generated-client/provider tests, problem semantics                                                          |
| Integration            | Browser/PostgreSQL repository conformance, transactions/outbox, queue idempotency, authz, usage ledger, import quarantine, version activation/rollback |
| End to end             | Critical local and cloud journeys including correction, offline/failure, export, upgrade/downgrade, quota UX, accessibility                            |
| Differential           | Compare engine/data/rule releases and investigate material change                                                                                      |
| Performance/resilience | Reference load, solve budgets, retry/timeout/circuit behavior, dependency and restore failure drills                                                   |
| Security/privacy       | ASVS evidence, threat-based tests, access isolation, log/telemetry scans, export/deletion                                                              |

## Local-first and migration gates

- Every canonical repository adapter passes the same behavioral contract and
  engine golden fixtures.
- Historical browser databases migrate through every supported schema path;
  interruption and storage-pressure fixtures retain the prior recoverable copy.
- Export/import proves schema compatibility, record counts, per-part hashes,
  referential integrity, and deterministic result equivalence.
- Upgrade/downgrade fault injection at every transition proves that exactly one
  authority remains writable and accepted facts are recoverable.
- Supported browsers cover storage persistence, eviction messaging, worker
  interruption, offline reload, quota exhaustion, and explicit clear-data UX.

## Entitlement and AI gates

| Area                          | Release evidence                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entitlements                  | Plan-catalog fixtures, billing-event authenticity, effective-period boundaries, downgrade/grace behavior, client-tamper denial                       |
| Usage accounting              | Concurrent reserve/consume/release, timeout reconciliation, duplicate provider callback, idempotent retry, timezone/billing-cycle boundary           |
| AI capture                    | Schema validity, material ambiguity escalation, hallucinated-food rejection, user edit/confirm/reject, no unconfirmed canonical write                |
| Experimental Local Processing | Explicit activation, compatibility/size disclosure, cancellation/cleanup, provider credential non-disclosure, safe fallback                          |
| Assistant                     | Grounding fidelity, ownership isolation, prompt/tool injection, allowlist/argument validation, required confirmation, refusal and audit completeness |

Generative-model evaluation is versioned by provider/model/configuration and
uses adversarial as well as representative multilingual inputs. A model change
passes contract, privacy, safety, cost, and regression gates.

## Nutrition engine gates

Golden cases cover canonical units, servings, edible portion, raw/cooked state,
recipe yield/retention, rounding boundaries, missing versus zero, detection
limits, target applicability, source-specific upper limits, timezone/day
boundaries, and corrections.

Numerical tolerances are defined per calculation and change through a reviewed
scientific rationale.

## Internal food data quality radar

Run `npm run quality:data` inside the DevContainer after the approved local food
catalog is installed. The command creates a private, reproducible HTML dashboard
and JSON report in `.temp/data-quality-radar/`; these outputs stay outside the
public website and Git history. The report names the catalog release, the source
artifact digest, the evaluation instant, and the radar policy version.
The DevContainer attach hook also generates the report from a receipt-verified
catalog and opens its development-only preview on forwarded port `3002` in VS
Code and GitHub Codespaces.

The coverage score is the percentage of latest-food-by-component pairs with a
known, unit-compatible, per-100-g edible observation. A recorded zero qualifies
as known. Explicitly unknown values and absent observations appear in separate
counts. Source traceability, method metadata, explicit quality grading, and
source-release freshness remain separate indicators with visible denominators.
The operational freshness alert window is 1,095 days from the source dataset
release; republishing a catalog preserves the original source age.

Catalog-side comparison potential counts foods with a portion and known values
for every component in the published adult baseline target set. User-specific
history, restrictions, recipe facts, and independent ranking validation remain
separate gates. The dashboard describes data readiness rather than nutritional
accuracy or physiological status. Unit tests exercise unknown-versus-zero,
source-age, and target-mapping behavior on small deterministic fixtures.

## Optional outcome feedback

Stage 4 keeps dated, user-entered weight measurements and transcribed lab
results as separate local user-context records. The weight view reports the
arithmetic change between its first and latest entries. Lab history groups
entries by the exact test name, reported unit, and laboratory; it presents the
values chronologically as descriptive records. These observations
support later evaluation and user review while recorded food intake, nutrient
state, and next-meal ranking retain their own evidence paths. An observation
retains its user-entered provenance and participates in verified local export.

Laboratory methods and reference ranges can differ; the same laboratory and
the original report provide the appropriate context for a clinician's review.
Reference: [MedlinePlus, How to Understand Your Lab Results](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/).

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

Safety and subgroup regressions remain independently visible alongside every
aggregate score.

## Prediction/model gates

A predictive model is released only with a documented intended use, training
and evaluation data, leakage controls, person- and time-separated holdout,
baseline comparison, MAE/appropriate error, calibration/interval coverage,
subgroup bias analysis, robustness, drift signals, rollback, and human/safety
oversight.

Unvalidated models run in offline or shadow mode. NIST AI RMF
Govern–Map–Measure–Manage is used when AI/ML materially affects user outcomes.

## Evaluation data governance

Datasets have provenance, license, purpose, version, inclusion/exclusion logic,
quality analysis, sensitive-data controls, contamination prevention, and an
owner. Release benchmarks are immutable and access-controlled. Model training
or unrelated evaluation with user data requires an approved purpose and
consent/legal basis.

## Release decision

The candidate produces a signed evidence bundle containing requirement
coverage, test/evaluation results, scientific/data versions, known limitations,
security/privacy evidence, performance environment, exceptions with expiry,
approvers, and rollback target.

Reference: [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework).
