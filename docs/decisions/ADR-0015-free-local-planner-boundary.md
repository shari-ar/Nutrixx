# ADR-0015: Free local planner capability boundary and quality floor

| Field                      | Value                                          |
| -------------------------- | ---------------------------------------------- |
| Status                     | Accepted                                       |
| Date                       | 2026-10-11                                     |
| Deciders                   | Nutrixx Product and Optimization               |
| Owner                      | Nutrixx Product                                |
| Resolves                   | OD-019                                         |
| Scientific release review  | Pending qualified review before launch         |
| Related requirements       | FR-008–010, FR-015; QR-001–003, QR-007, QR-014 |
| Supersedes / superseded by | None                                           |

## Context and problem

The Free tier promises useful local planning while the full Pro optimizer
arrives in Stage 9. The word _approximate_ describes search coverage; nutrient
arithmetic and safety validation retain evidence-based rules, while missing
data remains unknown.
The supported device budget and minimum quality need an explicit release gate.

## Decision drivers

- Keep Free planning functional with local data and installed reference assets.
- Preserve the same scientific meanings and hard safety rules across tiers.
- Make capability limits visible without presenting a heuristic as optimal.
- Measure user value on representative, feasible cases.

## Considered options

1. Treat Free as a preview of the hosted optimizer requiring network compute.
2. Return a static generic meal template under an optimizer label.
3. Deliver a bounded, deterministic local one-day planner with verified
   arithmetic, independent validation, and a truthful quality floor.

## Decision

Adopt option 3. Stage 4 Free planning executes entirely in the browser against
the locally authoritative profile, meals, food/recipe revisions, nutrition
state, and installed reference releases. It requires neither hosted compute,
AI inference, a provider key, nor an additional model download. Manual food,
recipe, meal, nutrition, export, and restore flows remain available when the
planner reaches a limit or fails. Experimental Local Processing in Stage 5
retains its separate opt-in and its own capability boundary.

The Free profile follows the one-day lifecycle in
[ADR-0014](ADR-0014-free-plan-horizon-and-lifecycle.md), the safety policy in
[ADR-0012](ADR-0012-local-planner-constraint-policy.md), and the bounded worker
search in [ADR-0013](ADR-0013-local-planner-search-and-replay.md). A maximum
of four slots, 24 eligible candidates per slot, four validated portion choices
per candidate, 128 beam states, 30,000 expansions, and a five-second worker
watchdog define the initial device envelope. The planner describes a feasible
result as **one validated option**, with a visible search-scope limitation.
The full multi-day/expanded-candidate optimizer and AI-dependent optimizer
capabilities remain Pro/Ultimate entitlements.

The Stage 4 quality floor is:

- zero published plans with escaped hard-constraint violations across golden,
  property, and adversarial release fixtures;
- zero invented nutrient amounts, target claims, or numeric explanations;
- a validated feasible plan for every approved reference fixture whose
  candidate set contains one under the supported search profile;
- distinct and accurate `NEEDS_INPUT`, `INFEASIBLE`, `SEARCH_LIMIT`,
  `OUT_OF_SCOPE`, and `ERROR` outcomes;
- stable output hashes for identical completed input snapshots and versions;
- complete offline planning after required local assets are installed;
- p95 under 10 seconds for the accepted one-day reference workload on each
  published supported-browser/reference-device pair, with UI responsiveness
  and cancellation verified separately.

The Stage 4 acceptance protocol defines the fixture corpus, browser versions,
reference device, measurement method, and observed results before sign-off.
Any failure of the safety or integrity floors blocks release. Performance and
coverage changes require an explicit policy revision and repeatable evidence.

## Consequences

### Positive

- Free delivers an end-to-end local planning loop with a clear quality bar.
- Scientific meaning and hard constraints remain shared with paid tiers.
- Later full-optimizer work can reuse the typed context and validator.

### Costs and trade-offs

- Candidate, slot, and compute limits narrow plan variety.
- The quality floor requires a curated reference corpus and device testing.
- Search-limit and sparse-data cases need helpful, truthful user guidance.

## Validation and review triggers

Stage 4 closes only after the complete advertised Free contract and the
published quality floor pass. Independent scientific and user-language review
before public launch follows
[ADR-0011](ADR-0011-provisional-science-release-gate.md). Revisit the boundary
when a new candidate source, browser class, planning horizon, or entitlement
changes the supported Free experience.
