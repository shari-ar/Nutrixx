# Daily nutrition state

| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| Status        | Implementation policy accepted; release review pending |
| Audience      | Nutrition science, engine, product, quality            |
| Owner         | Nutrixx Nutrition Science                              |
| Last reviewed | 2026-10-10                                             |

## Definition

Daily Nutrition State is an immutable estimate of recorded dietary intake for
an explicit local-day or rolling period, compared with the applicable target
policy. Body-store measurement and diagnosis require qualified clinical
processes, while the state reflects recorded intake exclusively. Accepted
period, terminology, and uncertainty policies appear in
[ADR-0008](../decisions/ADR-0008-recorded-intake-state-semantics.md),
[ADR-0009](../decisions/ADR-0009-nutrition-day-and-rolling-periods.md), and
[ADR-0010](../decisions/ADR-0010-intake-uncertainty-and-abstention.md).
Their conservative rules apply during private MVP evaluation; qualified review
precedes public launch under
[ADR-0011](../decisions/ADR-0011-provisional-science-release-gate.md).

## Inputs

- subject/profile ID and local period with IANA timezone/day-boundary policy;
- accepted meal/item revisions within the period;
- exact food/recipe and composition release references;
- applicable target-policy snapshot;
- nutrition engine/rule release;
- late-data watermark and prior snapshot reference when incremental.

## Calculation

1. Normalize each known item quantity through its traceable portion path.
2. Calculate nutrient amounts and quality metadata per item.
3. Aggregate exact known amounts without converting unknowns to zero.
4. Propagate completeness and uncertainty by nutrient.
5. Compare with applicable ranges/limits over the correct averaging horizon.
6. Classify intake evidence while reserving clinical classification for a
   qualified healthcare process.
7. Persist output plus input fingerprint and supersession relationship.

## Output per nutrient

| Field                    | Meaning                                                      |
| ------------------------ | ------------------------------------------------------------ |
| known amount + unit      | Sum supported by available evidence                          |
| coverage/completeness    | How much expected source information was known               |
| uncertainty/limitations  | Material range and assumptions                               |
| target range/type/source | Exact applicable policy snapshot                             |
| comparison               | Evidence-limited reference relation or indeterminate         |
| contributors             | Major foods/items with trace references                      |
| actionability            | Informational, planner objective, safety limit, or no action |

The public label scopes any decisive relation to **recorded intake**. A
single-day result expresses a logged observation, while the rolling trend
shows seven completed periods with explicit gaps and comparable targets.
Applicable upper limits retain source-category rules; toxicity assessment
requires a qualified clinical process.

## Late corrections and recomputation

A meal edit, timezone correction, dataset/rule change, or target-policy change
creates a new state snapshot. The old snapshot remains auditable. UI reads the
latest accepted snapshot and exposes pending/recalculation status when relevant.

## Statuses

- COMPLETE: required inputs and coverage meet approved thresholds.
- PARTIAL: useful result with disclosed non-critical gaps.
- NEEDS_INPUT: a critical ambiguity can materially change safety/action.
- OUT_OF_SCOPE: intended-use or policy boundary is crossed.
- ERROR: technical failure; no scientific conclusion is implied.
