# Delivery roadmap

| Field         | Value                                            |
| ------------- | ------------------------------------------------ |
| Status        | Proposed                                         |
| Audience      | Product, engineering, science, quality, security |
| Owner         | Nutrixx Product                                  |
| Last reviewed | 2026-09-22                                       |

Work is sequenced by risk: trustworthy facts and policy precede optimization.
Each stage is a releasable learning increment only after its exit evidence is
accepted.

## Stage 0 — Product and scientific contract

Deliver:

- intended use, population, exclusions, claims, jurisdiction assumptions;
- glossary, canonical quantity/fact model, data classifications;
- selected food/reference sources and licence assessment;
- scientific governance, baseline rules/targets, golden fixtures;
- threat model, privacy lifecycle, architecture decisions, OpenAPI conventions.

Exit: P0 decisions have accountable approval; a small end-to-end golden case is
reproducible from source record to user explanation.

## Stage 1 — Trustworthy food, recipe, and intake ledger

Deliver:

- progressive onboarding/consent;
- versioned food/portion/composition and recipe/yield model;
- fast food discovery and meal logging/correction;
- import quarantine/publication for the first supported catalog;
- provenance, unknown-versus-zero, and completeness in the user experience.

Exit: meal/recipe golden cases pass; ordinary logging meets research and
performance goals; authorization/privacy deletion/export paths are verified.

## Stage 2 — Nutrition and health context

Deliver:

- approved Health Context formulas and eligibility;
- immutable daily/rolling Nutrition State;
- applicable target ranges, uncertainty, contributor explanations, trends;
- version impact/recomputation and state-freshness operations.

Exit: 100% fingerprint coverage; scientific/regression gates pass; users do not
misinterpret state labels as diagnosis in evaluated UX.

## Stage 3 — Explainable planning

Deliver:

- immutable planning context and candidate set;
- hard/soft constraint policy and MILP/selected solver adapter;
- independent post-solve validator;
- infeasibility diagnostics, alternatives, explanation, feedback lifecycle;
- evaluation benchmark across supported cuisines/catalog coverage.

Exit: zero escaped hard violations in mandatory suites; accepted feasibility,
quality, latency, replay, explanation, and subgroup thresholds; kill
switch/rollback and incident runbook tested.

## Stage 4 — Data and operational scale

Deliver:

- additional licensed/culturally relevant catalog coverage;
- durable job/recomputation orchestration;
- mature SLO/error-budget program, capacity and cost controls;
- staged policy/data release, automated impact analysis, recovery exercises;
- professional curation and review workflow.

Exit: source freshness/coverage targets, load/SLOs, restore drills, and reviewer
throughput meet approved production objectives.

## Stage 5 — Optional integrations and validated intelligence

Candidates:

- devices/activity/sleep imports;
- laboratory observation import and professional pathways;
- calibrated predictions or preference learning;
- inventory, household, cost, availability, and shopping workflows.

Each candidate starts with purpose/consent, intended-use/regulatory review,
evidence and evaluation plan, adapter contract, threat model, and off-switch.
No integration is added merely because data is available.
