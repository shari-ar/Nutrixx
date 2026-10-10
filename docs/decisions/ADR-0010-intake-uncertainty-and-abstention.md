# ADR-0010: Intake uncertainty and abstention policy

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Status                     | Accepted                                |
| Date                       | 2026-10-10                              |
| Deciders                   | Nutrixx Product (implementation policy) |
| Owner                      | Nutrixx Product                         |
| Resolves                   | OD-009                                  |
| Scientific release review  | Pending Nutrition Science and Quality   |
| Related requirements       | FR-007, FR-012; QR-001, QR-002, QR-003  |
| Supersedes / superseded by | None                                    |

## Context and problem

Food composition, portion size, recipe yield, target applicability, and meal
logging each have different uncertainty. A single confidence score or an
arbitrary completeness percentage can turn limited evidence into an apparent
health conclusion. The release needs explicit rules for useful descriptive
output, comparison abstention, and requests for one material fact.

## Decision drivers

- Preserve measured zero, unknown, estimated, imputed, and inapplicable states.
- Make supported comparisons deterministic and reproducible.
- Keep incomplete records useful while presenting evidence-limited certainty.
- Give high-consequence upper-limit and eligibility questions conservative
  treatment.

## Considered options

1. Fill missing nutrient values with zero and compare the point total.
2. Publish comparisons above a fixed percentage of catalog coverage.
3. Propagate evidence by nutrient, use validated bounds where available, and
   abstain whenever material uncertainty can change a comparison or action.

## Decision

Adopt option 3 as the Stage 3 implementation baseline under the product owner's
direction. Independent Nutrition Science and Quality review authorizes
user-facing activation of comparisons and consequential downstream uses.

The engine carries each nutrient's known recorded subtotal, contributing
sources, quantity/composition quality states, missing-value reasons, and
material uncertainty components separately. Known zero contributes zero;
unknown remains unknown. Estimated and imputed values retain their method and
applicability. An interval is published only when its bounds have a validated
source and propagation rule. Interval aggregation uses conservative bounds
unless a reviewed correlation model supports narrower bounds. Missing
unbounded contributions leave the total upper bound open. Point estimates and
calibrated confidence percentages require separate, validated evidence.

Comparison is evaluated only after eligibility, target type, source category,
and period horizon are established. A comparison is decisive only when every
plausible total under the available validated bounds falls on the same side of
the applicable reference. An interval crossing a reference yields
**indeterminate**. For a lower intake reference, a bounded upper total below
the reference supports **recorded intake below reference**; a bounded lower
total at or above it supports **recorded intake at or above reference**. For an
applicable upper limit, a bounded lower total above the limit supports
**recorded intake above reference limit**; a bounded upper total at or below
it supports only **recorded amount at or below the limit in available data**.
These labels remain scoped to recorded intake, and the source coverage remains
visible.
Individual adequacy, toxicity, and clinical risk stay outside this rule.

The snapshot status is **COMPLETE** when every required recorded item and
applicable reference needed for its published comparisons has resolved
evidence under the approved rule; this status describes the records, while the
person's entire diet remains outside its scope. **PARTIAL** means a useful
descriptive subtotal has a disclosed gap. **NEEDS_INPUT** means one
user-answerable, material ambiguity
blocks an otherwise actionable result; the interface asks the smallest
relevant question. A missing catalog nutrient value leads to a data-quality
gap rather than a demand that the user invent a value. **OUT_OF_SCOPE**
applies when intended-use or target-population rules exclude the comparison.
**ERROR** denotes a technical failure. A per-nutrient comparison may be
indeterminate while the overall snapshot remains PARTIAL.

Release version 1 uses this structural decision-stability gate rather than an
unvalidated numerical coverage threshold. Any future numerical threshold or
probabilistic confidence statement requires calibration, subgroup evaluation,
qualified approval, and versioned fixtures. Planning and other consequential
uses receive only comparisons whose evidence and applicability satisfy their
separately approved safety policy; an indeterminate upper limit requires
further evidence before any safety-sensitive action.

## Consequences

### Positive

- Numeric claims remain traceable to evidence and target semantics.
- Descriptive intake can be shown even when a comparison abstains.
- Safety-sensitive uses receive explicit unresolved conditions.

### Costs and trade-offs

- More nutrients will display indeterminate comparisons until source quality
  or user-answerable inputs improve.
- Evidence-bound propagation requires more metadata and golden cases than a
  single point total.
- Qualified scientific review and evaluation remain prerequisites for release.

## Validation and review triggers

The Stage 3 release gate requires attributable Nutrition Science and Quality
review. Golden cases
cover known zero versus unknown, unbounded missing values, correlated
uncertainty, intervals entirely below/above/crossing each reference,
source-specific ULs, target inapplicability, travel-adjusted periods, and the
transition among COMPLETE, PARTIAL, NEEDS_INPUT, OUT_OF_SCOPE, and ERROR.
Property tests verify that adding an unknown contribution preserves or reduces
certainty and that worsening a bound preserves or weakens a claim. Revisit
after calibration evidence supports a numeric threshold or new target classes
are activated.

## References

- [NIH Office of Dietary Supplements: Nutrient Recommendations and Databases](https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx)
- [National Academies: Dietary Reference Intakes, Applications in Dietary Assessment](https://nap.nationalacademies.org/catalog/9956/dietary-reference-intakes-applications-in-dietary-assessment)
- [Nutrixx Scientific Evidence Policy](../quality/scientific-evidence-policy.md)
