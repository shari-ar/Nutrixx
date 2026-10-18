# Architecture Decision Records

| Field         | Value                        |
| ------------- | ---------------------------- |
| Status        | Process definition           |
| Audience      | Architecture and engineering |
| Owner         | Nutrixx Architecture         |
| Last reviewed | 2026-10-18                   |

ADRs capture decisions whose rationale must survive code changes. Use
`ADR-NNNN-short-title.md` and the [template](ADR-0000-template.md).

| ID                                                                   | Decision                                                            | Status   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| [ADR-0001](ADR-0001-modular-monolith-first.md)                       | Modular monolith with explicit domain boundaries                    | Proposed |
| [ADR-0002](ADR-0002-local-first-cloud-promotion.md)                  | Local-first product with verified single-authority cloud promotion  | Proposed |
| [ADR-0003](ADR-0003-shared-canonical-model.md)                       | Shared storage-neutral canonical model                              | Proposed |
| [ADR-0004](ADR-0004-entitlement-and-usage-accounting.md)             | Versioned entitlements and reserve/consume/release usage            | Proposed |
| [ADR-0005](ADR-0005-tool-mediated-generative-ai.md)                  | Generative AI is non-authoritative and tool-mediated                | Proposed |
| [ADR-0006](ADR-0006-browser-support-and-local-storage-resilience.md) | Supported browsers and resilient local storage                      | Accepted |
| [ADR-0007](ADR-0007-food-catalog-sources-and-release-quality.md)     | Food catalog sources, regional coverage, cadence, and quality gates | Accepted |
| [ADR-0008](ADR-0008-recorded-intake-state-semantics.md)              | Recorded intake state meaning and user-safe language                | Accepted |
| [ADR-0009](ADR-0009-nutrition-day-and-rolling-periods.md)            | Nutrition-day boundaries, travel, and rolling periods               | Accepted |
| [ADR-0010](ADR-0010-intake-uncertainty-and-abstention.md)            | Uncertainty propagation and abstention                              | Accepted |
| [ADR-0011](ADR-0011-provisional-science-release-gate.md)             | Provisional scientific policies during MVP development              | Accepted |
| [ADR-0016](ADR-0016-history-aware-next-meal-constraints.md)          | Nutrient-specific historical context for the next meal              | Accepted |
| [ADR-0017](ADR-0017-complete-local-next-meal-ranking.md)             | Complete local catalog ranking and replay                           | Accepted |
| [ADR-0018](ADR-0018-next-meal-lifecycle-and-inventory.md)            | Next-meal lifecycle and optional personal inventory                 | Accepted |
| [ADR-0019](ADR-0019-free-next-meal-quality-floor.md)                 | Free next-meal capability and quality floor                         | Accepted |
| [ADR-0020](ADR-0020-user-controlled-local-portability.md)            | Editable local files, complete backups, and optional encryption     | Accepted |

The documentation tree presents the active private-MVP design. Git history
retains earlier drafts; overview documents summarize and link to the accepted
ADRs as the decision source. After public release, published ADRs remain
immutable and later changes receive a new decision record.

ADR-0008 and ADR-0010 accept conservative implementation policies. ADR-0011
updates their review timing: provisional policies support private MVP
evaluation, and qualified scientific review precedes public launch.
ADRs 0016–0019 define the active Stage 4 Free next-meal planning design. The
[Free next-meal contract](../engines/next-meal-contract.md) specifies its
storage-neutral engine boundary.

Statuses: Proposed, Accepted, Rejected, Deprecated, Superseded.

Reference: [Architecture Decision Records](https://adr.github.io/) and
[MADR](https://adr.github.io/madr/).
