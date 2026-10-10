# Nutrition foundation and calculation policy

| Field         | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Status        | Proposed; requires qualified nutrition-science approval |
| Audience      | Nutrition science, engine and data engineers            |
| Owner         | Nutrixx Nutrition Science                               |
| Last reviewed | 2026-09-22                                              |

## Nutrient ontology

Each tracked component has a stable semantic ID, names/synonyms, component type,
canonical unit/dimension, measurement basis, parent/child relationships, source
mappings, and lifecycle status.

Component types—nutrients, subcomponents, bioactives, contaminants, allergens,
and derived metrics—remain explicit. Nutrient inclusion requires a defined
decision and demonstrated user value in addition to source availability.

## Unit and numeric policy

- All arithmetic uses exact decimal quantities and dimension-checked
  conversions.
- Storage uses a canonical unit per nutrient while APIs carry unit and basis
  explicitly.
- Unit conversion and portion conversion are separate operations.
- Intermediate calculations preserve precision; rounding occurs only at an
  explicitly versioned publication/display boundary.
- Incompatible dimensions fail validation and remain in quarantine.

## Food calculation

For a known composition value:

```text
consumed amount
= composition amount per canonical basis
× edible consumed quantity / basis quantity
```

The calculation is valid only when food revision, preparation state, edible
portion, basis, and conversion path match. Manufacturer-label and analytical
values remain separately sourced observations even when one is selected.

## Recipe calculation

A published recipe version records ingredient revisions and quantities, method,
final edible yield, servings, optional retention/yield factors, and calculation
rule release.

```text
recipe nutrient amount
= Σ ingredient nutrient amount × applicable retention factor

output concentration
= recipe nutrient amount / measured or policy-approved final edible yield
```

Missing ingredient values propagate into coverage. A retention factor is used
only when source, applicability, and rule version are approved; otherwise the
system presents the explicit assumption or withholds unsupported precision.
The current local recipe editor accepts a user-supplied cooking-loss percentage
for a named nutrient and ingredient, records its rule as user-entered, and
applies the corresponding retained fraction. An omitted percentage leaves the
ingredient composition unadjusted and its retention evidence unspecified.
Already-cooked food observations require no second cooking adjustment. Future
curated factors must map a food and preparation method to a documented source,
such as the [USDA Table of Nutrient Retention Factors, Release 6](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/nutrient-retention-factors/).

## Intake targets

Targets are versioned policies with:

- target type such as RDA, AI, EAR, UL, AMDR, or product-specific constraint;
- population criteria including age, relevant physiological attributes, and
  life stage;
- geography/authority and source publication;
- amount/range, unit, averaging horizon, and effective dates;
- whether a limit applies to all intake, supplements, fortified sources, or
  another defined subset;
- evidence/approval state and limitations.

The initial authoritative baseline uses National Academies Dietary Reference
Intakes as presented and cross-checked through NIH Office of Dietary
Supplements sources: RDA is preferred when applicable, AI is used only when no
RDA exists, EAR supports population/uncertainty reasoning rather than an
individual goal, UL is enforced only for its defined source and population,
and AMDR expresses macronutrient ranges. Label Daily Value is display context,
distinct from a personalized target. Every activated target records authority, edition,
population, jurisdiction applicability, and effective date and requires
independent approval from a qualified nutrition-science professional; when
sources conflict or applicability is unknown, the engine abstains instead of
silently selecting or averaging values.

RDA, AI, UL, and label Daily Value retain distinct meanings. Deficiency
assessment requires a qualified clinical process, and physiological nutrient
status requires the applicable evidence horizon and clinical context.

## Missing data and uncertainty

| State                  | Meaning                                        | Aggregation behavior                                     |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| measured/reported zero | Source explicitly states zero under its method | Numeric zero with provenance                             |
| below detection        | Present below an analytical limit              | Preserve limit/method; policy selects interval treatment |
| inapplicable           | Component lies outside a defined rule          | Excluded with reason                                     |
| unknown                | No defensible value                            | Null; reduces coverage                                   |
| estimated              | Model or proxy produced the value              | Include only with method and uncertainty                 |
| imputed                | Missing value filled under an approved policy  | Distinct from sourced fact; sensitivity tested           |

Uncertainty sources—portion, food composition, measurement, activity estimate,
model parameter, and target applicability—are tracked separately. A critical
unknown produces NEEDS_INPUT or abstention when it could change safety or the
recommended action.

## Bioavailability and interactions

Bioavailability, nutrient interactions, and medication effects influence a
calculation only through an approved, versioned rule with a defined population,
dose/exposure, direction, confidence, and exclusion criteria. Narrative
evidence becomes an optimizer coefficient after the applicable approval and
validation process.

## Energy policy

Energy is one canonical nutrient concept. Source-reported energy and energy
derived from macronutrient factors are distinct observations with method
metadata. A versioned selection/comparison rule prevents them from becoming two
independent truths.

## Scientific references

USDA cooking estimates use Release 6 true nutrient-retention factors for a
matching raw-food treatment. Each factor multiplies the raw ingredient's
nutrient total before recipe concentration is calculated. Release 2
meat/poultry and curated Agriculture Handbook 102 legume, vegetable, and grain
weight yields multiply raw ingredient weights for matching food identities and
methods. Yield factors may exceed one when water is absorbed. SR Legacy FDC IDs
are crosswalked to NDB numbers before matching raw foods to yield rows. Recipe
steps linked to specific ingredients suggest treatment and yield rows when the
method resolves to one unique match. Ambiguous or unmatched methods stay under
manual selection, and a measured final edible weight supplies the denominator
for recipes outside the audited yield coverage. The pinned source tables record
release provenance and SHA-256 hashes; published recipe versions retain the
applied treatment and yield rules.

- [USDA nutrient retention factors, Release 6](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/nutrient-retention-factors/)
- [USDA cooking yields for meat and poultry, Release 2](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/cooking-yields/)
- [USDA Agriculture Handbook 102: Food Yields Summarized by Different Stages of Preparation](https://www.ars.usda.gov/SP2UserFiles/Place/80400525/Data/Classics/ah102.pdf)

- [NIH Office of Dietary Supplements: Dietary Reference Intakes](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations/)
- [National Academies DRI resources](https://www.nationalacademies.org/our-work/dietary-reference-intakes-tables-and-application)
- [USDA FoodData Central data documentation](https://fdc.nal.usda.gov/data-documentation/)
- [UCUM unit specification](https://ucum.org/ucum)
