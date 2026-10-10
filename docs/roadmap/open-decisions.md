# Open decisions

| Field         | Value                                       |
| ------------- | ------------------------------------------- |
| Status        | Living decision register                    |
| Audience      | Product and all technical/scientific owners |
| Owner         | Nutrixx Product                             |
| Last reviewed | 2026-10-10                                  |

| ID     | Priority | Decision                                                                                                           | Accountable owner            | Must resolve before       |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------- |
| OD-006 | P0       | Privacy roles, purposes/legal bases, consent, retention, export/deletion, and launch-jurisdiction obligations      | Privacy + Legal              | Any user-data launch      |
| OD-008 | P1       | Hard versus soft planner constraints and priority/relaxation/infeasibility policy                                  | Science + Product            | Stage 4 build             |
| OD-010 | P1       | Solver, portion granularity, solve budget, acceptable gap, replay retention                                        | Optimization + Platform      | Stage 4/9 build           |
| OD-011 | P1       | Plan horizon/lifecycle, substitution, adherence, feedback, and notification semantics                              | Product                      | Stage 4 design            |
| OD-012 | P1       | Production platform/region, RTO/RPO/SLOs, secret/KMS, queue, and object storage                                    | Platform + Security          | Production launch         |
| OD-013 | P1       | OpenAPI version after complete tooling compatibility test                                                          | API Architecture             | Public contract expansion |
| OD-014 | P2       | Predictive model necessity, outcome, dataset, baseline, calibration, and activation gate                           | Product + ML + Science       | Stage 11 candidate        |
| OD-015 | P2       | Household/shared recipes, inventory, availability, and commerce boundaries                                         | Product                      | Stage 11 candidate        |
| OD-017 | P1       | Upgrade recovery, downgrade read-only grace, payment-failure grace, cloud deletion, and backup-expiry periods      | Product + Privacy + Support  | Stage 6 build             |
| OD-018 | P1       | Ultimate assistant allowance, text/voice scope, conversation memory, and fair-use/cost policy                      | Product + AI + Privacy       | Stage 10 design           |
| OD-019 | P0       | Exact boundary, algorithm, device budget, and quality floor of the Free local approximate optimizer                | Product + Optimization       | Stage 4 build             |
| OD-020 | P1       | Supported AI providers/models, browser OAuth versus BYOK modes, WebGPU model size, languages, and support boundary | AI + Security + Product      | Stage 5 build             |
| OD-021 | P1       | Entitlement catalog versioning, billing-cycle timezone, manual support adjustment, and commercial price policy     | Product + Finance + Platform | Stage 6 build             |

## Resolved decisions

| ID     | Resolution                                                                                                                         | Authoritative record                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| OD-001 | International general-wellness product for consenting adults with jurisdiction-gated launches                                      | [Product constitution](../product/constitution.md#initial-market-and-supported-population) |
| OD-002 | Versioned DRI/NIH baseline with typed targets, explicit source boundaries, and qualified approval                                  | [Nutrition foundation](../nutrition-model/foundation.md#intake-targets)                    |
| OD-003 | USDA FDC CC0 first release, license-gated source portfolio, international coverage corpora, and blocking quality gates             | [ADR-0007](../decisions/ADR-0007-food-catalog-sources-and-release-quality.md)              |
| OD-004 | Recorded-intake state, explicit daily and seven-completed-day horizons, and general-wellness language                              | [ADR-0008](../decisions/ADR-0008-recorded-intake-state-semantics.md)                       |
| OD-005 | Error-reduction assistance with physician approval required for higher-risk use                                                    | [Product constitution](../product/constitution.md#clinical-and-higher-risk-contexts)       |
| OD-007 | Effective-dated IANA nutrition-day zone, travel-aware periods, late correction, and seven completed rolling days                   | [ADR-0009](../decisions/ADR-0009-nutrition-day-and-rolling-periods.md)                     |
| OD-009 | Evidence-bound nutrient comparisons with structural abstention and user-answerable NEEDS_INPUT                                     | [ADR-0010](../decisions/ADR-0010-intake-uncertainty-and-abstention.md)                     |
| OD-016 | Baseline-aligned support matrix, IndexedDB authority, dynamic headroom, explicit persistence UX, and change-aware export reminders | [ADR-0006](../decisions/ADR-0006-browser-support-and-local-storage-resilience.md)          |

Every open decision requires an ADR, scientific policy, or product-policy record
with alternatives, evidence, consequences, and approval before implementation.
OD-004, OD-007, and OD-009 are accepted as implementation decisions. The
qualified scientific and quality release gates recorded in ADR-0008 and
ADR-0010 remain active before user-facing activation.
