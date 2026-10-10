# Architecture Decision Records

| Field         | Value                        |
| ------------- | ---------------------------- |
| Status        | Process definition           |
| Audience      | Architecture and engineering |
| Owner         | Nutrixx Architecture         |
| Last reviewed | 2026-10-10                   |

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

Accepted ADRs are immutable history. A new ADR supersedes an old one and links
both directions. Overview documents summarize and link while ADRs remain the
exclusive decision source.

ADR-0008 and ADR-0010 accept conservative implementation policies. ADR-0011
updates their review timing: provisional policies support private MVP
evaluation, and qualified scientific review precedes public launch.

Statuses: Proposed, Accepted, Rejected, Deprecated, Superseded.

Reference: [Architecture Decision Records](https://adr.github.io/) and
[MADR](https://adr.github.io/madr/).
