# ADR-0019: Free next-meal capability boundary and quality floor

| Field                     | Value                                          |
| ------------------------- | ---------------------------------------------- |
| Status                    | Accepted                                       |
| Date                      | 2026-10-12                                     |
| Deciders                  | Nutrixx Product and Optimization               |
| Owner                     | Nutrixx Product                                |
| Resolves                  | OD-019, revised                                |
| Scientific release review | Pending qualified review before public launch  |
| Related requirements      | FR-008–010, FR-015; QR-001–003, QR-007, QR-014 |

## Context and problem

Free planning remains entirely local. The product promise covers a complete
ranked next-meal catalog and source-backed recent-intake context. The private
MVP needs a measurable quality floor for this promise.

## Decision drivers

- Keep Free next-meal recommendations useful offline with installed assets.
- Preserve hard-rule and nutrient arithmetic semantics across tiers.
- Make ranking coverage and missing evidence visible.
- Give full-catalog work a measured browser/device envelope.

## Considered options

1. Keep the old one-day shortlist quality floor.
2. Display a fast partial list as a complete catalog ranking.
3. Gate release on complete eligible-catalog coverage, independent validation,
   deterministic replay, and measured local performance.

## Decision

Adopt option 3. The Free next-meal flow executes in a supported browser using
locally authoritative profile, consumption history, food and recipe versions,
personal inventory when enabled, and installed reference and temporal-policy
releases. Hosted compute, AI inference, provider credentials, and an additional
model download are outside this Free ranking path. Manual food, recipe, meal,
nutrition, export, and restore flows remain available alongside planner
limits. Experimental Local Processing retains its separate opt-in boundary.

The Stage 4 release quality floor is:

- zero published hard-constraint violations across golden, property, and
  adversarial fixtures;
- zero invented nutrient amounts, temporal-window claims, ranking explanations,
  or numerical comparisons;
- complete classification of every entry in the active locally installed food
  and recipe catalog, with all comparable eligible entries ordered and every
  remaining entry assigned a visible reason;
- one independently validated result per user-visible ranked candidate, with
  explicit evidence-limited treatment where comparison support is incomplete;
- distinct `READY`, `PARTIAL`, `NEEDS_INPUT`, `INFEASIBLE`, `SEARCH_LIMIT`,
  `OUT_OF_SCOPE`, `CANCELLED`, and `ERROR` states under the next-meal contract;
- stable ranking and run hashes for identical completed inputs and versions;
- complete offline ranking after required local assets are installed;
- responsive UI, cancellation, and a proposed p95 under 10 seconds for a
  complete next-meal ranking on each published catalog/reference-device and
  supported-browser pair, with measured results before sign-off.

A partial evaluation exposes processed and total catalog counts. It can assist
exploration while preserving its `PARTIAL` label. A first-ranked suitability
claim belongs to a `READY` run with complete coverage and current inputs.
The exact catalog size, memory budget, device characteristics, and measurement
protocol are fixed in the Stage 4 acceptance corpus. The Free ranking score
expresses a policy-based dietary preference within the general-wellness scope.

## Consequences

### Positive

- Free users receive an end-to-end next-meal choice without constructing a
  shortlist.
- Ranking completeness, safety, and explanatory accuracy become testable.
- Existing validated local calculations and canonical storage remain useful.

### Costs and trade-offs

- A complete catalog ranking requires index and worker-performance work.
- Sparse source composition can place many foods in an evidence-limited group.
- The release gate requires representative catalogs and device benchmarks.

## Validation and review triggers

Stage 4 closes after the complete advertised Free contract and this quality
floor pass. The acceptance corpus includes large and sparse catalogs,
inventory-filtered cases, time-zone transitions, historical corrections,
offline replay, cancellation, and performance on named browser/device pairs.
Qualified scientific and user-language review before public launch follows
[ADR-0011](ADR-0011-provisional-science-release-gate.md). New source classes,
population scope, temporal policies, and entitlement boundaries trigger a
versioned decision review.
