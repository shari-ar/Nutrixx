# Stage 3 target policy version 1

| Field         | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| Status        | MVP implementation contract with provisional adult catalog |
| Audience      | Nutrition science, product, engine, quality                |
| Owner         | Nutrixx Nutrition Science                                  |
| Last reviewed | 2026-10-10                                                 |

## Decision boundary

The [nutrition engine](https://github.com/shari-ar/Nutrixx/tree/main/packages/nutrition-engine) ships a
versioned provisional adult Dietary Reference Intake (DRI) release and accepts
additional immutable releases through the same contract. It preserves source,
population, unit, and publication status in each selected target. The initial
release is an MVP general-wellness baseline. A qualified clinician reviews the
completed product and its scientific releases before public launch under the
[scientific evidence policy](../quality/scientific-evidence-policy.md).

## Release and rule contract

Each release has a stable release ID, policy version, applicable ISO 3166-1
alpha-2 markets, effective interval, publication state, author attribution for
provisional publication or reviewer attribution for expert review, and a list
of uniquely identified rules. Each rule records nutrient ID, target type,
value and unit, population criteria, averaging horizon, intake-source scope,
effective interval, and primary authority, publication title, edition, and URL.

| Type | Individual-use interpretation                           | Horizon       | Selection rule                                       |
| ---- | ------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| RDA  | Intake planning reference                               | Daily average | Preferred over AI for the same applicable population |
| AI   | Intake planning reference where an RDA is unavailable   | Daily average | Selected only where an applicable RDA is absent      |
| EAR  | Distinct assessment reference                           | Daily average | Returned only through an explicit EAR query          |
| UL   | Applicable upper reference for specified intake sources | Daily limit   | Source scope is preserved in the output              |
| AMDR | Macronutrient energy-share range                        | Energy share  | Returned as a range with explicit unit               |

Label Daily Value remains display context and is excluded from personalized
target selection. The initial target authority follows the
[nutrition foundation](foundation.md#intake-targets). Target releases retain
jurisdiction and source applicability in their publication evidence; selection
uses a published release for the user's configured market.

## Initial adult catalog

The bundled `dri-us-ca-adult-2019-summary-v1` release covers ages 18–120 in
the United States and Canada. Its adult age bands follow the National
Academies' 14–18, 19–30, 31–50, 51–70, and over-70 rows; the first band applies
only to age 18 here. It includes 27 USDA-mapped nutrient concepts: adult
RDA/AI references, three macronutrient energy-share ranges, and four precisely
scoped all-intake upper limits. The selected rule retains the exact Appendix J
table and page citation. The source values and interpretation were checked
against the [National Academies' DRI summary tables](https://www.nationalacademies.org/read/25353/chapter/28),
linked by the [NIH Office of Dietary Supplements](https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx).

The committed USDA crosswalk records exact source nutrient IDs, names, and
observation units from the active Foundation/SR Legacy food catalog. Copper's
source DRI micrograms are represented as milligrams to match the USDA
observation unit. Folate DFE and vitamin A RAE retain their distinct chemical
equivalence definitions. The `AMDR` unit is percent of energy; a later
Nutrition State calculation will derive that percentage from nutrient and
energy observations.

The first catalog omits comparisons where the active food observation lacks
the required equivalence or source partition: vitamin K forms, niacin
equivalents, preformed-vitamin-A upper limits, synthetic folate/vitamin E upper
limits, and pharmacological magnesium upper limits. Sodium AI remains an
adequate-intake reference; a chronic-disease-risk-reduction ceiling requires a
separately typed policy. Total water remains part of the dedicated hydration
workflow. Additional jurisdictions and populations use additional releases.

## Minimum-input applicability

The existing starting profile remains sufficient to enter the dashboard. A
dated Health Context snapshot uses its age, physiological reference, height,
weight, goal, and time zone. Optional birth date resolves a material age-band
ambiguity; activity is requested only when a published energy rule needs it.
An omitted life stage uses an explicit provisional adult assumption recorded in
the snapshot. Explicitly unknown life stage or physiological reference remains
uncertain. Equivalent target decisions across plausible age or physiological
groups are selected immediately; a material difference yields `NEEDS_INPUT`
with only the relevant field. An
unsupported population or conflicting target release yields `OUT_OF_SCOPE`.
Market is confirmed only when target applicability needs it; a missing market
returns `NEEDS_INPUT`, and a release for another market returns `OUT_OF_SCOPE`.

The implementation interprets reported age conservatively as a range
as time passes after the profile revision. An optional birth date resolves
exact age on the local assessment date. Pregnancy, lactation, and a declared
higher-risk context route to the product's qualified-care boundary. Height,
weight, goal, and activity remain inputs. The source-derived 2023 maintenance
energy rule is described in [Health Context](../engines/health-context.md#maintenance-energy).

## Publication and verification

The initial catalog is validated against the rule schema at module load.
Golden fixtures cover official iron, calcium, vitamin D, upper-limit, and AMDR
age boundaries. The pure selector accepts provisional and reviewed releases,
preserves that status in its output, and rejects draft, inactive, missing, or
conflicting releases at runtime. Publication checks cover source provenance,
population coverage, unit dimensions, age bands, overlapping rules, and exact
USDA nutrient mappings. Expert review and clinical corrections follow before
public launch. User-facing comparison and trend integration belongs to the
subsequent Stage 3 work packages.

## References

- [NIH Office of Dietary Supplements: Nutrient Recommendations and Databases](https://ods.od.nih.gov/healthinformation/nutrientrecommendations.aspx)
- [National Academies: Dietary Reference Intakes for Energy](https://nap.nationalacademies.org/catalog/26818/dietary-reference-intakes-for-energy)
- [National Academies: Dietary Reference Intakes, Applications in Dietary Assessment](https://nap.nationalacademies.org/catalog/9956/dietary-reference-intakes-applications-in-dietary-assessment)
- [National Academies: Appendix J, Dietary Reference Intakes Summary Tables](https://www.nationalacademies.org/read/25353/chapter/28)
