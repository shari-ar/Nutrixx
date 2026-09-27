# Architecture Decision Records

| Field         | Value                        |
| ------------- | ---------------------------- |
| Status        | Process definition           |
| Audience      | Architecture and engineering |
| Owner         | Nutrixx Architecture         |
| Last reviewed | 2026-09-27                   |

ADRs capture decisions whose rationale must survive code changes. Use
`ADR-NNNN-short-title.md` and the [template](ADR-0000-template.md).

| ID                                             | Decision                                         | Status   |
| ---------------------------------------------- | ------------------------------------------------ | -------- |
| [ADR-0001](ADR-0001-modular-monolith-first.md) | Modular monolith with explicit domain boundaries | Proposed |
| [ADR-0002](ADR-0002-local-first-cloud-promotion.md) | Local-first product with verified single-authority cloud promotion | Proposed |
| [ADR-0003](ADR-0003-shared-canonical-model.md) | Shared storage-neutral canonical model | Proposed |
| [ADR-0004](ADR-0004-entitlement-and-usage-accounting.md) | Versioned entitlements and reserve/consume/release usage | Proposed |
| [ADR-0005](ADR-0005-tool-mediated-generative-ai.md) | Generative AI is non-authoritative and tool-mediated | Proposed |

Accepted ADRs are immutable history. A new ADR supersedes an old one and links
both directions. Overview documents summarize and link; they do not become a
second decision source.

Statuses: Proposed, Accepted, Rejected, Deprecated, Superseded.

Reference: [Architecture Decision Records](https://adr.github.io/) and
[MADR](https://adr.github.io/madr/).
