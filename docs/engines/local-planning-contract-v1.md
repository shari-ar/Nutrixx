# Free local planning contract v1

| Field         | Value                               |
| ------------- | ----------------------------------- |
| Status        | Stage 4 implementation contract     |
| Audience      | Optimization, storage, web, quality |
| Owner         | Nutrixx Optimization Engineering    |
| Last reviewed | 2026-10-12                          |

The `@nutrixx/optimizer-engine` package owns the storage-neutral contract. A
browser worker and future server adapter can consume the same immutable input
and produce the same typed outcome. The first implementation profile is the
Free, one-day, offline planner governed by
[ADR-0012](../decisions/ADR-0012-local-planner-constraint-policy.md),
[ADR-0013](../decisions/ADR-0013-local-planner-search-and-replay.md),
[ADR-0014](../decisions/ADR-0014-free-plan-horizon-and-lifecycle.md), and
[ADR-0015](../decisions/ADR-0015-free-local-planner-boundary.md).

## Input snapshot

`PlanningInputV1` captures one effective nutrition day, owner and request IDs,
profile eligibility and revision, declared restrictions and revision,
recorded-intake nutrients, applicable target rules, reference releases, and
one to four ordered eating slots. Recorded slots retain meal revision links.
Open slots retain up to 24 ordered candidates. Each candidate embeds its exact
food or recipe revision, resolved ingredient/allergen evidence, nutrient
observations with explicit known/unknown states, and up to four validated
edible-gram portion options. This bounded snapshot carries the facts required
to interpret a historical run after a reference-cache eviction.

Known nutrient zero and an unknown nutrient have different states. Units,
source evidence, target scope, and policy releases accompany every applicable
numeric decision. The input also records the fixed Free search profile:
128 beam states, 30,000 expansions, and a 5,000 ms worker watchdog.

## Outcome and run record

`PlanningOutcomeV1` carries its own format and schema version and returns
`READY`, `NEEDS_INPUT`, `INFEASIBLE`,
`SEARCH_LIMIT`, `OUT_OF_SCOPE`, or `ERROR`. A `READY` outcome holds exactly
one candidate and portion for every open slot, `FEASIBLE` solver status,
`optimalityGap: null`, and an independent-validation report. `INFEASIBLE`
holds a direct-contradiction or complete finite-exhaustion proof.
`SEARCH_LIMIT` identifies the expansion or watchdog bound. Other outcomes
carry actionable reason codes. Recorded slots remain consumption facts.

`PlanningRunV1` carries its own schema version and stores the frozen input, exact outcome, input/output SHA-256
fingerprints, engine/constraint/scoring versions, seed, search trace, and
timestamps. A canonical `planning-run` record seals the run under the planning
owning context. Fingerprint helpers use canonical JSON and a caller-provided
SHA-256 implementation, keeping browser and Node hashing compatible.

The schema verifies identity, bounds, ordering, references, and lifecycle
shapes. The independent solver-result validator in the next Stage 4 work
packages recomputes nutrients and hard constraints before a `READY` result is
published. A later plan-lifecycle package persists accepted plan revisions
separately from immutable runs and recorded meals.
