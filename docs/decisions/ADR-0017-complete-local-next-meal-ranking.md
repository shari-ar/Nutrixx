# ADR-0017: Complete local next-meal ranking and replay

| Field                | Value                                  |
| -------------------- | -------------------------------------- |
| Status               | Accepted                               |
| Date                 | 2026-10-12                             |
| Deciders             | Nutrixx Product and Optimization       |
| Owner                | Nutrixx Optimization Engineering       |
| Resolves             | OD-010, revised                        |
| Related requirements | FR-008–010, FR-015; QR-001–003, QR-007 |

## Context and problem

The Free product promises an automatically generated ordering of the locally
available catalog for the next eating occasion. The user should encounter the
best-supported suggestion first and retain access to lower-ranked options.

## Decision drivers

- Remove food search and candidate selection from the ordinary planning path.
- Preserve complete catalog coverage and truthful ranking scope.
- Keep the browser responsive, offline, deterministic, and replayable.
- Distinguish an eligible comparison from an unsafe, unavailable, or
  evidence-limited entry.

## Considered options

1. Reuse the user-selected 24-candidate shortlist as the default.
2. Show only a fast top-K shortlist while labeling its first item as globally
   best.
3. Enumerate the active local catalog, classify every entry, rank every
   comparable eligible entry, and expose the remainder with reasons.

## Decision

Adopt option 3 for Stage 4. A dedicated Web Worker enumerates every entry in
the active installed food and recipe releases plus current user foods and
recipes. The candidate policy classifies each entry for the **next meal** as
eligible and comparable, eligible with limited comparison evidence,
unavailable under the selected inventory mode, excluded by a declared rule,
or requiring preparation. Directly edible foods and fully resolved edible
recipes can enter the recommendation ranking. Every catalog entry remains
discoverable with its classification and reason. Classification precedes
scoring, and verified hard constraints precede soft objectives.

The worker evaluates supported portions for each eligible candidate against
the frozen profile, recorded history, temporal policy, source releases, and
preferences. Its scoring policy has explicit, versioned objective order,
normalization, and deterministic tie-breakers. The result is a complete order
of comparable eligible candidates under that policy, with one selected portion
per ranked food or recipe. The full catalog view places comparable eligible
entries first, followed by evidence-limited entries and other classified
entries in stable reason-and-identity order. The latter groups carry their
classification rather than an implied nutritional suitability rank. The first
item means **highest-ranked among evaluated eligible candidates under this
policy**, rather than a clinical claim or proven global nutritional optimum.
The user can browse the entire classified list with pagination or
virtualization.

Indexing, cached source features, parallelizable evaluation, and progressive
rendering may improve responsiveness. A published **complete** ranking
requires a census of every active catalog entry and validation of every
ranked result. A worker limit, cancellation, or missing asset produces an
explicit partial or unavailable status with coverage counts; the interface
presents partial work as partial work. Complete-ranking claims require the full
catalog census; a fixed top-K truncation carries a partial label. The exact worker budget and supported catalog/device
envelope are measured under [ADR-0019](ADR-0019-free-next-meal-quality-floor.md).

An independently implemented validator recomputes hard rules, portions, and
material numeric claims for user-visible results. The application rechecks
profile, meal, inventory, food/recipe, scientific-rule, and catalog revisions
before presenting a cached ranking as current. An immutable local run retains
the input fingerprint, evaluated catalog manifest and coverage, policy and
source versions, deterministic ordering keys, result hash, and validation
evidence. The selected recommendation retains enough food and portion facts
to interpret its history after reference-cache eviction. Export includes the
accepted local records and their required replay evidence.

## Consequences

### Positive

- The default experience asks the user to choose among suggestions rather
  than construct the candidate set.
- Complete and partial rankings carry distinct, verifiable meanings.
- Existing source resolution, hard-rule validation, and replay infrastructure
  remain reusable.

### Costs and trade-offs

- Full-catalog evaluation requires indexing, careful memory bounds, and a
  measured supported-device envelope.
- A change in recorded history or a catalog release invalidates cached order.
- Foods with limited evidence remain visible while receiving appropriately
  limited comparison claims.

## Validation and review triggers

Fixtures assert complete source census, stable total order, deterministic ties,
safe exclusion, evidence-limited grouping, source-revision freshness, worker
cancellation, offline replay, and identical output hashes for identical
snapshots. Benchmarks compare full-catalog p50/p95 latency and memory on each
supported reference browser/device. A top-ranked claim requires a complete
evaluation and independent validation under the active policy.

## References

- [WHATWG HTML Standard: Workers](https://html.spec.whatwg.org/multipage/workers.html)
