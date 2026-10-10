# ADR-0008: Recorded intake state semantics

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Status                     | Accepted                                |
| Date                       | 2026-10-10                              |
| Deciders                   | Nutrixx Product (implementation policy) |
| Owner                      | Nutrixx Product                         |
| Resolves                   | OD-004                                  |
| Scientific release review  | Pending qualified independent review    |
| Related requirements       | FR-007, FR-012; QR-002, QR-003          |
| Supersedes / superseded by | None                                    |

## Context and problem

The term _Nutrition State_ can be mistaken for a measurement of nutrient stores,
clinical adequacy, or a diagnosis. Dietary reference values describe intake
planning and assessment under specified populations and horizons. A single
recorded day is especially sensitive to incomplete logging and ordinary
day-to-day variation.

## Decision drivers

- Make the result useful after minimal user input while preserving its evidence
  boundary.
- Keep daily observations, multi-day patterns, physiological status, and
  clinical assessment distinct.
- Carry target type, population, source, and averaging horizon into every
  comparison.
- Use language that ordinary users understand as general-wellness information.

## Considered options

1. Present the result as a general personal nutrition or health score.
2. Present a single-day intake-to-target comparison as an adequacy verdict.
3. Present versioned **recorded dietary intake** for an explicit period, with
   evidence-limited comparisons and a separate multi-day trend.

## Decision

Adopt option 3 as the Stage 3 implementation baseline under the product owner's
direction. Independent qualified scientific review authorizes release of
user-facing intake comparisons and wording.

_Nutrition State_ is an internal domain name for an immutable estimate of
**recorded dietary intake**, its evidence quality, and its comparison with an
applicable reference over an explicit period. The user-facing headings are
**Nutrition overview**, **Recorded intake**, and **Intake trend**. The state
describes dietary records rather than body nutrient stores, physiological
status, disease, or a clinical assessment.

The default daily view covers one nutrition day under [ADR-0009](ADR-0009-nutrition-day-and-rolling-periods.md).
The default trend covers the most recent seven **completed** nutrition days;
the current day remains a separately labeled, in-progress observation. Each
day retains its own completeness and target applicability. The trend reports
per-day values and, where comparable, a descriptive mean of recorded daily
intake. The pattern represents observed records; estimating usual intake or
individual adequacy probability belongs to a separate, approved assessment.
Missing days and unrecorded meals remain unobserved rather than zero-valued.
A trend with differing target policies is segmented by policy so each
comparison retains its own reference.

Target evaluation follows the approved target's population, source category,
and averaging horizon. RDA and AI are presented as intake references; EAR has
its own assessment meaning; UL applies only to its specified intake sources
and population; Daily Value remains label context. A day below an RDA or AI
may be described as **recorded intake below the reference** when evidence
supports that bounded statement. A recorded amount above an applicable UL is
described as **recorded intake above the reference limit** with the relevant
source category and a prompt to seek qualified advice when appropriate. This
wording leaves deficiency, toxicity, and treatment judgments to qualified
clinical processes. Comparison outcomes follow the conservative evidence
policy in [ADR-0010](ADR-0010-intake-uncertainty-and-abstention.md).

Each visible result includes its period, recorded-versus-estimated basis,
target type/source, material data gaps, and a way to inspect contributors.
The interface uses **insufficient information** when a material comparison is
indeterminate. Product copy and evaluation must confirm that users understand
the state as a general-wellness estimate of their records.

## Consequences

### Positive

- Daily feedback stays available while health and nutrient sufficiency retain
  their separate clinical meaning.
- Trends preserve data gaps and reference-policy changes.
- The same period and target semantics can be replayed locally and in cloud
  mode.

### Costs and trade-offs

- A familiar single score gives way to a more explicit, multi-part explanation.
- Trend aggregation requires period-aware target and data-quality checks.
- Qualified scientific and user-language review remains a release gate.

## Validation and review triggers

The Stage 3 release gate requires attributable Nutrition Science review of the
scientific interpretation and user-facing language. Golden fixtures cover
one-day variation, unrecorded days, RDA/AI/EAR/UL/Daily
Value distinctions, source-specific limits, changed targets, and partial
records. Evaluated users must identify the output as an estimate of recorded
dietary intake for general wellness. Revisit this decision when target
authority, supported population, or intended-use language changes.

## References

- [NIH Office of Dietary Supplements: Nutrient Recommendations and Databases](https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx)
- [National Academies: Dietary Reference Intakes, Applications in Dietary Assessment](https://nap.nationalacademies.org/catalog/9956/dietary-reference-intakes-applications-in-dietary-assessment)
- [FDA: General Wellness Policy for Low Risk Devices](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)

The FDA reference informs US wording boundaries; launch-jurisdiction review
sets the applicable policy for each market.
