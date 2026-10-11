# Daily nutrition state

| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| Status        | Local calculation and browser presentation implemented |
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

The version 1 local implementation consumes the current committed meal
revisions from the Consumption ledger. Each meal carries pinned food/recipe
references and its recorded nutrition calculation. A revised food dataset
affects new calculations; re-evaluating an existing meal creates a corrected
meal revision with the chosen source version. The Nutrition State fingerprint
includes the meal revisions, Health Context, target release, and zone policy.

## Calculation

1. Read the current accepted meal revision and its pinned nutrition result.
2. Assign each occurrence instant to an effective-dated IANA nutrition day.
3. Map compatible USDA nutrient identifiers and units to target concepts.
4. Sum known decimal amounts exactly; carry missing meals and items separately.
5. Select intake references and applicable upper limits for the dated Health
   Context and market. Compare only when evidence supports a stable relation.
6. Build seven completed daily states and a descriptive trend from comparable
   observed ordinary periods. Preserve missing and travel-adjusted periods.
7. Commit changed daily and rolling snapshots atomically with fingerprints,
   input watermark, calculation version, and supersession links.

The current implementation keeps AMDR energy-share comparisons indeterminate
while validated nutrient energy attribution is being developed. It exposes the
typed AMDR reference for subsequent evaluation. Recorded subtotals reflect
the available composition and quantities, with individual nutrition status
remaining outside the inference boundary.

## Output per nutrient

| Field                    | Meaning                                              |
| ------------------------ | ---------------------------------------------------- |
| known amount + unit      | Sum supported by available evidence                  |
| evidence + missing IDs   | Known recorded values and exact composition gaps     |
| uncertainty/limitations  | Material range and assumptions                       |
| target range/type/source | Exact applicable policy snapshot                     |
| comparison               | Evidence-limited reference relation or indeterminate |
| contributors             | Major foods/items with trace references              |
| actionability            | Subsequent presentation/planner policy               |

The public label scopes any decisive relation to **recorded intake**. A
single-day result expresses a logged observation, while the rolling trend
shows seven completed periods with explicit gaps and comparable targets.
Applicable upper limits retain source-category rules; toxicity assessment
requires a qualified clinical process.

## Late corrections and recomputation

A meal correction, zone-policy change, or target-policy change produces a new
input fingerprint and immutable state snapshot. The prior snapshot remains
auditable through the correction link. For a late correction, the local ledger
can recompute the former and new nutrition days plus their dependent rolling
windows, including historical windows outside the current seven-day view.
The presentation layer reads the latest state for its active policy version.

The browser Nutrition route recalculates the active window from the current
meal ledger whenever it opens. Meal save, correction, and removal also request
recomputation for affected periods. A failed derived refresh leaves the
authoritative meal revision intact; opening the route retries reconciliation.
The browser suggests its detected IANA zone for travel while retaining the
current nutrition-day zone until the user reviews and confirms a change. The
confirmed preference is a versioned canonical user-context record whose new
zone starts at the next boundary in the previous zone. A pending change can be
replaced or canceled before that boundary. Starting-profile edits retain the
original zone, and completed periods keep their historical identities. The
transition period is marked travel-adjusted and withholds daily target
comparisons.

The browser assesses each period against a stable period/profile timestamp.
Reloading an unchanged period later in the same day therefore reuses its
fingerprint and preserves the immutable snapshot history.

The selected US or Canada target region is retained as a versioned canonical
user-context record and participates in the calculation fingerprint. Until a
region is selected, recorded amounts remain visible while target comparisons
request that input. The route shows contributing meals, composition gaps, and
seven completed days with explicit unobserved periods. Progress bars reflect
only evidence-complete recorded meals with a compatible target, and their
percentage describes recorded intake relative to a reference; personal
nutritional status requires a separate qualified assessment.

The [Stage 3 acceptance protocol](../quality/stage-3-local-nutrition-acceptance.md)
tracks independent reference fixtures, release-impact replay, offline behavior,
and the pending human comprehension evaluation.

## Statuses

- COMPLETE: the recorded meals and selected intake references have resolved
  evidence under the structural version 1 rule.
- PARTIAL: useful recorded subtotals with explicit composition or period gaps.
- NEEDS_INPUT: a critical ambiguity can materially change safety/action.
- OUT_OF_SCOPE: intended-use or policy boundary is crossed.
- ERROR: technical failure; no scientific conclusion is implied.
