# Open decisions

| Field         | Value                                       |
| ------------- | ------------------------------------------- |
| Status        | Living decision register                    |
| Audience      | Product and all technical/scientific owners |
| Owner         | Nutrixx Product                             |
| Last reviewed | 2026-09-27                                  |

| ID     | Priority | Decision                                                                                                      | Accountable owner           | Must resolve before       |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------- |
| OD-001 | P0       | Launch market, intended-use wording, supported adult population, and excluded conditions                      | Product + Legal/Clinical    | Stage 0 exit              |
| OD-002 | P0       | Authoritative target/UL policies by jurisdiction/population and qualified scientific approver                 | Nutrition Science           | Stage 0 exit              |
| OD-003 | P0       | Food data sources/licences, Iranian/regional food coverage, update cadence, and quality threshold             | Data + Legal                | Stage 2 build             |
| OD-004 | P0       | Formal meaning/horizon of Nutrition State and user-safe terminology                                           | Nutrition Science + Product | Stage 3 design            |
| OD-005 | P0       | Medication, condition, lab, eating-disorder, pregnancy/child, and referral policies                           | Clinical/Safety             | Stage 0 exit              |
| OD-006 | P0       | Privacy roles, purposes/legal bases, consent, retention, export/deletion, and launch-jurisdiction obligations | Privacy + Legal             | Any user-data launch      |
| OD-007 | P1       | Day boundary, timezone/travel, late correction, and rolling-window semantics                                  | Product + Domain            | Stage 3 build             |
| OD-008 | P1       | Hard versus soft planner constraints and priority/relaxation/infeasibility policy                             | Science + Product           | Stage 4 build             |
| OD-009 | P1       | Uncertainty propagation and NEEDS_INPUT/abstention thresholds                                                 | Science + Quality           | Stage 3 release           |
| OD-010 | P1       | Solver, portion granularity, solve budget, acceptable gap, replay retention                                   | Optimization + Platform     | Stage 4/9 build           |
| OD-011 | P1       | Plan horizon/lifecycle, substitution, adherence, feedback, and notification semantics                         | Product                     | Stage 4 design            |
| OD-012 | P1       | Production platform/region, RTO/RPO/SLOs, secret/KMS, queue, and object storage                               | Platform + Security         | Production launch         |
| OD-013 | P1       | OpenAPI version after complete tooling compatibility test                                                     | API Architecture            | Public contract expansion |
| OD-014 | P2       | Predictive model necessity, outcome, dataset, baseline, calibration, and activation gate                      | Product + ML + Science      | Stage 11 candidate        |
| OD-015 | P2       | Household/shared recipes, inventory, availability, and commerce boundaries                                    | Product                     | Stage 11 candidate        |
| OD-016 | P0       | Supported browsers/devices, local storage budget, persistence UX, minimum free disk, and export reminder policy | Web + Product + Quality    | Stage 1 exit              |
| OD-017 | P1       | Upgrade recovery, downgrade read-only grace, payment-failure grace, cloud deletion, and backup-expiry periods | Product + Privacy + Support | Stage 6 build             |
| OD-018 | P1       | Ultimate assistant allowance, text/voice scope, conversation memory, and fair-use/cost policy                  | Product + AI + Privacy      | Stage 10 design           |
| OD-019 | P0       | Exact boundary, algorithm, device budget, and quality floor of the Free local approximate optimizer            | Product + Optimization      | Stage 4 build             |
| OD-020 | P1       | Supported AI providers/models, browser OAuth versus BYOK modes, WebGPU model size, languages, and support boundary | AI + Security + Product  | Stage 5 build             |
| OD-021 | P1       | Entitlement catalog versioning, billing-cycle timezone, manual support adjustment, and commercial price policy | Product + Finance + Platform | Stage 6 build          |

An open decision is not permission to choose implicitly in code. The owner
creates an ADR, scientific policy, or product-policy record with alternatives,
evidence, consequences, and approval.
