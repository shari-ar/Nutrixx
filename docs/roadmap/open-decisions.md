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
| OD-015 | P2       | Household/shared inventory, shared recipes, and commerce boundaries beyond the personal next-meal inventory mode   | Product                      | Stage 11 candidate        |
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
| OD-008 | Nutrient-specific historical intake context, verified hard rules, and evidence-qualified soft ranking                                             | [ADR-0016](../decisions/ADR-0016-history-aware-next-meal-constraints.md)                   |
| OD-010 | Complete deterministic local catalog ranking, explicit coverage status, validation, and replay                                                    | [ADR-0017](../decisions/ADR-0017-complete-local-next-meal-ranking.md)                      |
| OD-011 | Next-meal-only recommendation, explicit consumption logging, and optional personal inventory                                                      | [ADR-0018](../decisions/ADR-0018-next-meal-lifecycle-and-inventory.md)                     |
| OD-019 | Offline Free next-meal boundary, complete-ranking quality floor, and measured device envelope                                                     | [ADR-0019](../decisions/ADR-0019-free-next-meal-quality-floor.md)                          |

Every open decision requires an ADR, scientific policy, or product-policy record
with alternatives, evidence, consequences, and approval before implementation.
OD-004, OD-007, OD-009, OD-008, OD-010, OD-011, and OD-019 are accepted as
implementation decisions. The
conservative rules in ADR-0008 and ADR-0010 remain active. ADR-0011 sets
qualified scientific and quality review before public launch.
ADR-0018 resolves the personal next-meal inventory scope; OD-015 retains the
later shared-household and commerce questions. ADR-0009 continues to govern
the daily and seven-completed-day Nutrition views, while ADR-0016 governs
planning-specific historical intake comparisons.
