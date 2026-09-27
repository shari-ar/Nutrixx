# Daily nutrition state

| Field         | Value                                           |
| ------------- | ----------------------------------------------- |
| Status        | Proposed; scientific semantics require approval |
| Audience      | Nutrition science, engine, product, quality     |
| Owner         | Nutrixx Nutrition Science                       |
| Last reviewed | 2026-09-27                                      |

## Definition

Daily Nutrition State is an immutable estimate of recorded dietary intake for
an explicit local-day or rolling period, compared with the applicable target
policy. It is not a measurement of body stores, a diagnosis, or proof that an
unlogged meal was not consumed.

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
6. Classify the evidence, not the person's clinical condition.
7. Persist output plus input fingerprint and supersession relationship.

## Output per nutrient

| Field                    | Meaning                                                      |
| ------------------------ | ------------------------------------------------------------ |
| known amount + unit      | Sum supported by available evidence                          |
| coverage/completeness    | How much expected source information was known               |
| uncertainty/limitations  | Material range and assumptions                               |
| target range/type/source | Exact applicable policy snapshot                             |
| comparison               | below/within/above/indeterminate under policy semantics      |
| contributors             | Major foods/items with trace references                      |
| actionability            | Informational, planner objective, safety limit, or no action |

“Below” over one day means below the selected intake reference for that period;
it MUST NOT be labeled “deficient.” “Above” requires policy-aware handling of
upper limits and source categories and MUST NOT automatically imply toxicity.

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
