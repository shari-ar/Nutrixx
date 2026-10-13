# ADR-0016: History-aware next-meal constraint policy

| Field                     | Value                                         |
| ------------------------- | --------------------------------------------- |
| Status                    | Accepted                                      |
| Date                      | 2026-10-12                                    |
| Deciders                  | Nutrixx Product (private MVP policy)          |
| Owner                     | Nutrixx Product and Nutrition Science         |
| Resolves                  | OD-008, revised                               |
| Scientific release review | Pending qualified review before public launch |
| Related requirements      | FR-007–010, FR-015; QR-001–003                |

## Context and problem

The Free planner now recommends the **next meal only**. Its decision depends on
actual recorded intake from the relevant preceding period, which can differ by
nutrient and by reference type. An intake-comparison window and any claim about
body stores require evidence beyond a nutrient's biological residence time.
Daily RDA/AI values, usual intake, and source-specific upper limits have
different meanings. The existing seven-completed-day Nutrition view remains a
descriptive trend under [ADR-0009](ADR-0009-nutrition-day-and-rolling-periods.md);
planning horizons follow their own temporal policies.

## Decision drivers

- Let recent recorded consumption influence the next suggestion at the
  nutrient's applicable horizon.
- Preserve hard exclusions and source-backed safety rules ahead of ranking.
- Separate observed dietary intake from estimated physiological status.
- Expose missing history and composition as uncertainty.
- Keep every temporal rule versioned, attributable, and replayable.

## Considered options

1. Score only intake in the current nutrition day.
2. Assign a universal 24-hour or three-day window based on presumed nutrient
   retention.
3. Use a versioned nutrient-and-reference-specific temporal policy with
   explicit evidence and an unresolved state.

## Decision

Adopt option 3. A planning request freezes the latest accepted revisions of
recorded meals that overlap the maximum supported lookback for its active
policy. Each applicable comparison rule identifies its nutrient, population,
reference type and release, intake-source scope, temporal basis, duration or
period count, aggregation, units, evidence citation, and policy version. The
temporal basis distinguishes the effective nutrition day, elapsed-time rolling
intake, and supported usual-intake summaries. The engine evaluates each rule
against its own window; a 24-hour or 72-hour rule enters a release only with
evidence for that exact comparison and its intended use.

An initial private-MVP release can use already sourced daily references for
their documented planning purpose. Nutrient-specific rolling rules join the
ranking when their reference source, horizon evidence, aggregation, minimum
known-meal count, population, and limitations are recorded in the policy
release. A calendar-day reference is distinct from a rolling 24-hour
reference. The presence of a citation is a traceability requirement;
scientific review must still confirm that it supports the selected horizon
and intended use.

Recorded consumption is the intake authority. Prior proposals, selected
recommendations, and unlogged days contribute no invented intake. Every
recommendation states its assumption that the user has logged all consumption;
the application requests no separate completeness attestation. A short history
can support an explicitly provisional next-meal comparison when its rule allows
that treatment and its minimum known-meal count is met. The recommendation
identifies the shorter observed span and explains that more recorded history
can improve it. Unknown nutrient composition, incompatible units, and
unresolved safety-sensitive facts retain an explicit limited-evidence state.
Applicable hard limits use their own reference horizon and source scope; prior
shortfalls provide no credit against a current upper-limit check. The
independent validator recomputes every supported hard comparison from the
same frozen facts.

Soft ordering uses only comparable, evidence-supported nutrient observations
at their declared horizons, including distinctly labeled provisional
comparisons where the rule permits them. The score identifies a preference
among eligible foods under the active policy; the UI presents it as a dietary
planning estimate for general wellness, distinct from a measurement of nutrients
stored in the body. The UI exposes the time window, observed coverage,
material uncertainty, and rules actually influencing the ordering.
Declared exclusions, edible portions, and applicable hard rules take priority
over soft scores. The candidate inventory restriction in
[ADR-0018](ADR-0018-next-meal-lifecycle-and-inventory.md) is an additional
user-selected availability gate.

## Consequences

### Positive

- The next-meal ranking can respond to relevant recorded history rather than
  treating each day as an isolated nutrient reset.
- Rule-specific horizons avoid a universal, scientifically unsupported
  nutrient-retention assumption.
- Temporal evidence and missing-history limits remain visible and testable.

### Costs and trade-offs

- More meal revisions and policy metadata enter each frozen run.
- Sparse or irregular logging reduces the number of comparable nutrient
  objectives.
- Nutrient-specific temporal releases require source review and regression
  fixtures before activation.

## Validation and review triggers

Golden fixtures cover distinct 24-hour and multi-day policies once sourced,
partial windows, unlogged days, corrections, daylight-saving transitions,
time-zone changes, unit/source mismatches, daily upper limits, and overlapping
windows. Property tests verify that a missing contribution preserves or
reduces certainty and that prior deficits leave hard upper limits unchanged.
Qualified scientific and user-language review follows
[ADR-0011](ADR-0011-provisional-science-release-gate.md) before public launch.

## References

- [NIH Office of Dietary Supplements: Nutrient Recommendations and Databases](https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx)
- [National Academies: Dietary Reference Intakes, Applications in Dietary Planning](https://nap.nationalacademies.org/catalog/10609/dietary-reference-intakes-applications-in-dietary-planning)
- [EFSA: Dietary Reference Values](https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values)
