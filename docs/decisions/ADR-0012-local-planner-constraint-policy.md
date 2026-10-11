# ADR-0012: Free local planner constraint policy

| Field                      | Value                                  |
| -------------------------- | -------------------------------------- |
| Status                     | Accepted                               |
| Date                       | 2026-10-11                             |
| Deciders                   | Nutrixx Product (MVP implementation)   |
| Owner                      | Nutrixx Product and Nutrition Science  |
| Resolves                   | OD-008                                 |
| Scientific release review  | Pending qualified review before launch |
| Related requirements       | FR-008–010, FR-015; QR-001, QR-003     |
| Supersedes / superseded by | None                                   |

## Context and problem

The Free planner must return useful food suggestions from incomplete local food
composition while preserving the recorded-intake uncertainty rules. Food
safety and clinical suitability require separate evidence and authority beyond
a search score.

## Decision drivers

- Keep declared exclusions and validated safety rules ahead of every score.
- Use applicable nutrient references only at their supported evidence level.
- Explain missing composition, conflicts, and every user-visible trade-off.
- Keep policy versioned and independently testable.

## Considered options

1. Treat every nutrient target as a mandatory daily bound.
2. Convert missing values to zero and apply a single weighted score.
3. Separate verified hard constraints from evidence-qualified soft objectives,
   with explicit abstention and conflict outcomes.

## Decision

Adopt option 3 for the private Free MVP. The versioned constraint policy has
these ordered gates:

1. **Eligibility and identity:** supported adult general-wellness context,
   current food/recipe revisions, resolved edible portions, and an eligible
   planning day and meal slot.
2. **User-declared exclusions:** explicitly prohibited foods or ingredients
   and applicable allergy restrictions. A candidate requires sufficiently
   verified ingredient/allergen evidence to satisfy a declared restriction;
   unresolved evidence excludes that candidate. An unresolved restriction
   affecting the whole candidate set yields `NEEDS_INPUT` or `OUT_OF_SCOPE`
   with a precise reason.
3. **Structural and source-backed limits:** valid portion bounds, serving and
   slot consistency, and a scientifically approved hard upper bound only when
   its population, intake-source category, horizon, units, and composition
   evidence all apply. Unresolved safety-sensitive evidence withholds a
   validated plan rather than asserting compliance.
4. **Soft objectives:** applicable intake-reference distance, stated food
   preferences, practicality, diversity, and known cost/preparation data.
   Nutrient deviation contributes only with applicable targets and sufficiently
   complete, compatible composition. Missing optional data creates a visible
   limitation and contributes no invented score.

The order of soft objectives is nutrition evidence, explicit preferences and
schedule, then practical cost/time and variety. Versioned normalization and
stable tie-breakers prevent implicit weight changes. The Free planner may
relax a soft preference only with an explicit explanation and user review.
Every hard constraint remains mandatory. The user can correct a fact or change
a declared preference through its owning workflow and request a new run.

`INFEASIBLE` requires a verified contradiction or an exhausted finite search
space. A bounded search that ends without a feasible plan reports
`SEARCH_LIMIT` and offers safe input or candidate changes without claiming
that the full problem has no solution. Any published plan passes the
independent validator under the same active policy and context revisions.

Intake references describe recorded dietary intake rather than a diagnosis,
treatment target, or guarantee of individual adequacy. Safety-sensitive
interpretation follows [ADR-0008](ADR-0008-recorded-intake-state-semantics.md)
and [ADR-0010](ADR-0010-intake-uncertainty-and-abstention.md).

## Consequences

### Positive

- Safety and user prohibitions remain separate from preference scoring.
- Partial food evidence can support useful, clearly bounded planning.
- Conflict and search-limit results retain distinct, truthful meanings.

### Costs and trade-offs

- Verified restrictions can reduce the eligible candidate pool.
- Sparse nutrient composition reduces optimization coverage and may withhold
  safety-sensitive planning.
- New hard nutrient bounds require policy review and golden fixtures.

## Validation and review triggers

Fixtures cover declared exclusions, unknown allergen evidence, portion bounds,
inapplicable or source-specific upper limits, missing nutrient composition,
hard-rule conflicts, and soft-preference relaxation. The independent validator
must reject every escaped hard violation. Revisit this policy when the
supported population, catalog evidence, target release, or intended use
changes. Qualified scientific review remains a public-launch gate under
[ADR-0011](ADR-0011-provisional-science-release-gate.md).

## References

- [NIH Office of Dietary Supplements: Nutrient Recommendations and Databases](https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx)
- [National Academies: Dietary Reference Intakes, Applications in Dietary Assessment](https://nap.nationalacademies.org/catalog/9956/dietary-reference-intakes-applications-in-dietary-assessment)
