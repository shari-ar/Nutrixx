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
and derived metrics—remain explicit. Nutrients are not added merely because a
source contains a column; inclusion requires a defined decision or user value.

## Unit and numeric policy

- All arithmetic uses exact decimal quantities and dimension-checked
  conversions.
- Storage uses a canonical unit per nutrient while APIs carry unit and basis
  explicitly.
- Unit conversion and portion conversion are separate operations.
- Intermediate calculations preserve precision; rounding occurs only at an
  explicitly versioned publication/display boundary.
- Incompatible dimensions fail validation. They are never coerced.

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
not a personalized target. Every activated target records authority, edition,
population, jurisdiction applicability, and effective date and requires
independent approval from a qualified nutrition-science professional; when
sources conflict or applicability is unknown, the engine abstains instead of
silently selecting or averaging values.

RDA, AI, UL, and label Daily Value are not interchangeable. A daily intake gap
does not diagnose deficiency, and a single-day comparison MUST NOT be
described as physiological nutrient status.

## Missing data and uncertainty

| State                  | Meaning                                        | Aggregation behavior                                     |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| measured/reported zero | Source explicitly states zero under its method | Numeric zero with provenance                             |
| below detection        | Present below an analytical limit              | Preserve limit/method; policy selects interval treatment |
| not applicable         | Component cannot apply under a defined rule    | Excluded with reason                                     |
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
evidence alone does not become an optimizer coefficient.

## Energy policy

Energy is one canonical nutrient concept. Source-reported energy and energy
derived from macronutrient factors are distinct observations with method
metadata. A versioned selection/comparison rule prevents them from becoming two
independent truths.

## Scientific references

- [NIH Office of Dietary Supplements: Dietary Reference Intakes](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations/)
- [National Academies DRI resources](https://www.nationalacademies.org/our-work/dietary-reference-intakes-tables-and-application)
- [USDA FoodData Central data documentation](https://fdc.nal.usda.gov/data-documentation/)
- [UCUM unit specification](https://ucum.org/ucum)
