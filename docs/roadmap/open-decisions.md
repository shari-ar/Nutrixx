# Open decisions

| Field         | Value                                       |
| ------------- | ------------------------------------------- |
| Status        | Living decision register                    |
| Audience      | Product and all technical/scientific owners |
| Owner         | Nutrixx Product                             |
| Last reviewed | 2026-10-11                                  |

| ID     | Priority | Decision                                                                                                           | Accountable owner            | Must resolve before       |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------- |
| OD-006 | P0       | Privacy roles, purposes/legal bases, consent, retention, export/deletion, and launch-jurisdiction obligations      | Privacy + Legal              | Any user-data launch      |
| OD-012 | P1       | Production platform/region, RTO/RPO/SLOs, secret/KMS, queue, and object storage                                    | Platform + Security          | Production launch         |
| OD-013 | P1       | OpenAPI version after complete tooling compatibility test                                                          | API Architecture             | Public contract expansion |
| OD-014 | P2       | Predictive model necessity, outcome, dataset, baseline, calibration, and activation gate                           | Product + ML + Science       | Stage 11 candidate        |
| OD-015 | P2       | Household/shared recipes, inventory, availability, and commerce boundaries                                         | Product                      | Stage 11 candidate        |
| OD-017 | P1       | Upgrade recovery, downgrade read-only grace, payment-failure grace, cloud deletion, and backup-expiry periods      | Product + Privacy + Support  | Stage 6 build             |
| OD-018 | P1       | Ultimate assistant allowance, text/voice scope, conversation memory, and fair-use/cost policy                      | Product + AI + Privacy       | Stage 10 design           |
| OD-020 | P1       | Supported AI providers/models, browser OAuth versus BYOK modes, WebGPU model size, languages, and support boundary | AI + Security + Product      | Stage 5 build             |
| OD-021 | P1       | Entitlement catalog versioning, billing-cycle timezone, manual support adjustment, and commercial price policy     | Product + Finance + Platform | Stage 6 build             |

## Resolved decisions

| ID     | Resolution                                                                                                                                        | Authoritative record                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| OD-001 | International general-wellness product for consenting adults with jurisdiction-gated launches                                                     | [Product constitution](../product/constitution.md#initial-market-and-supported-population) |
| OD-002 | Versioned DRI/NIH baseline with typed targets, explicit source boundaries, and provisional MVP publication; qualified review before public launch | [Nutrition foundation](../nutrition-model/foundation.md#intake-targets)                    |
| OD-003 | USDA FDC CC0 first release, license-gated source portfolio, international coverage corpora, and blocking quality gates                            | [ADR-0007](../decisions/ADR-0007-food-catalog-sources-and-release-quality.md)              |
| OD-004 | Recorded-intake state, explicit daily and seven-completed-day horizons, and general-wellness language                                             | [ADR-0008](../decisions/ADR-0008-recorded-intake-state-semantics.md)                       |
| OD-005 | Error-reduction assistance with physician approval required for higher-risk use                                                                   | [Product constitution](../product/constitution.md#clinical-and-higher-risk-contexts)       |
| OD-007 | Effective-dated IANA nutrition-day zone, travel-aware periods, late correction, and seven completed rolling days                                  | [ADR-0009](../decisions/ADR-0009-nutrition-day-and-rolling-periods.md)                     |
| OD-009 | Evidence-bound nutrient comparisons with structural abstention and user-answerable NEEDS_INPUT                                                    | [ADR-0010](../decisions/ADR-0010-intake-uncertainty-and-abstention.md)                     |
| OD-016 | Baseline-aligned support matrix, IndexedDB authority, dynamic headroom, explicit persistence UX, and change-aware export reminders                | [ADR-0006](../decisions/ADR-0006-browser-support-and-local-storage-resilience.md)          |
| OD-008 | Verified hard constraints, evidence-qualified soft objectives, and distinct infeasibility and search-limit outcomes                               | [ADR-0012](../decisions/ADR-0012-local-planner-constraint-policy.md)                       |
| OD-010 | Bounded deterministic worker search, validated portion choices, explicit solver status, and local replay artifacts                                | [ADR-0013](../decisions/ADR-0013-local-planner-search-and-replay.md)                       |
| OD-011 | One-day Free horizon, explicit draft/acceptance/substitution, separate meal facts, and in-app feedback                                            | [ADR-0014](../decisions/ADR-0014-free-plan-horizon-and-lifecycle.md)                       |
| OD-019 | Offline Free capability boundary, initial device envelope, and measurable Stage 4 quality floor                                                   | [ADR-0015](../decisions/ADR-0015-free-local-planner-boundary.md)                           |

Every open decision requires an ADR, scientific policy, or product-policy record
with alternatives, evidence, consequences, and approval before implementation.
OD-004, OD-007, OD-009, OD-008, OD-010, OD-011, and OD-019 are accepted as
implementation decisions. The
conservative rules in ADR-0008 and ADR-0010 remain active. ADR-0011 sets
qualified scientific and quality review before public launch.
