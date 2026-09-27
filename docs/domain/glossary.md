# Domain glossary

| Field         | Value                        |
| ------------- | ---------------------------- |
| Status        | Proposed target language     |
| Audience      | All contributors             |
| Owner         | Nutrixx Domain Working Group |
| Last reviewed | 2026-09-27                   |

| Term                          | Meaning                                                                                                              | Important distinction                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Food                          | A consumable catalog item with identity, preparation state, portions, composition observations, and provenance.      | A food is not a recipe formula.                                                     |
| Food composition observation  | A sourced nutrient amount for a food on an explicit basis.                                                           | It is evidence, not an eternal property.                                            |
| Nutrient                      | A canonical analyte or dietary component tracked by the platform.                                                    | Nutrients, bioactives, contaminants, and derived metrics require explicit types.    |
| Portion                       | A named or measured quantity convertible to an edible mass or volume under a stated method.                          | “One cup” without food-specific conversion is incomplete.                           |
| Recipe                        | The stable identity of a preparation authored or curated over time.                                                  | It has many immutable recipe versions.                                              |
| Recipe version                | An exact ingredient, quantity, yield, and method snapshot.                                                           | Editing creates a new version; historical meals do not move.                        |
| Meal                          | A user event grouping consumed items at a local date/time.                                                           | It is actual consumption, not a recommended plan slot.                              |
| Meal item                     | A consumed quantity referencing the exact food or recipe output known at logging time.                               | Its captured facts remain auditable after catalog updates.                          |
| Observation                   | A value observed or reported at a time with source, unit, and quality metadata.                                      | It is not automatically a clinical conclusion.                                      |
| Target                        | A versioned range or threshold applicable to a defined population and time horizon.                                  | RDA, AI, UL, and Daily Value are not interchangeable.                               |
| Constraint                    | A condition considered by the planner.                                                                               | Hard constraints cannot be traded for score; soft constraints can.                  |
| Objective                     | A normalized, weighted preference optimized after hard feasibility.                                                  | It is not a safety limit.                                                           |
| Nutrition state               | A derived, versioned assessment of intake versus applicable targets for a period.                                    | It is not a diagnosis.                                                              |
| Plan                          | A validated set of proposed meals, portions, and alternatives for a stated horizon.                                  | A plan is a proposal until consumed.                                                |
| Optimizer run                 | An immutable execution record containing input snapshot, model, solver configuration, outputs, and diagnostics.      | A run is not just its winning plan.                                                 |
| Provenance                    | The chain connecting a value to source, transformation, policy, and version.                                         | A URL alone is insufficient provenance.                                             |
| Confidence                    | A calibrated statement about data or model reliability under defined evidence.                                       | It is not a decorative percentage.                                                  |
| Completeness                  | The extent to which required components have known values.                                                           | Complete does not mean accurate.                                                    |
| Uncertainty                   | A representation of plausible variation from measurement, composition, portion, or model error.                      | Unknown and uncertain are related but not identical.                                |
| Dataset release               | An immutable collection of validated source records and mappings approved for use.                                   | Staging data is not publishable data.                                               |
| Rule set                      | An immutable release of scientific formulas, conversions, targets, and eligibility policy.                           | Code version and scientific policy version are separate.                            |
| Eligibility                   | Whether the product can safely handle a request within its intended use.                                             | Ineligible does not mean unhealthy.                                                 |
| Local mode                    | Authority mode in which one browser profile holds the canonical user nutrition database.                             | It is not cloud backup or cross-device sync.                                        |
| Cloud mode                    | Authority mode in which Nutrixx cloud holds canonical user nutrition data and devices synchronize against it.        | A device cache is not another authority.                                            |
| Canonical authority           | The single writable location whose committed version decides the current user fact.                                  | Availability of a copy does not make it authoritative.                              |
| Entitlement                   | A versioned, effective-dated grant to use a capability under a plan or exception.                                    | Client UI visibility is not authorization.                                          |
| Usage reservation             | An idempotent temporary claim on a metered hosted action that becomes consumed or released.                          | It is not the same as a completed domain write.                                     |
| AI action                     | One user-initiated hosted inference attempt with stable identity and usage lifecycle.                                | Provider calls and retries may belong to one action.                                |
| Capture draft                 | Structured AI-proposed meal or recipe data awaiting user review and domain validation.                               | It is not a canonical meal or recipe.                                               |
| Experimental Local Processing | An explicitly enabled Free advanced setting for user-supplied provider access or device-local WebGPU/WASM inference. | It is not marketed as a plan benefit and does not unlock paid optimizer capability. |
| Migration session             | A resumable, auditable transition between local and cloud authority using a verified manifest.                       | Upload completion alone does not switch authority.                                  |
| Tool invocation               | A typed assistant request to an allowlisted application capability with authorization and audit context.             | Model-generated intent is not permission to execute.                                |

Terms that carry regulatory or scientific meaning MUST be scoped to a source,
population, geography, and effective version.
