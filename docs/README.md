# Nutrixx technical documentation

| Field         | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| Status        | Target-state index                                            |
| Audience      | Product, engineering, nutrition science, security, operations |
| Owner         | Nutrixx Engineering                                           |
| Last reviewed | 2026-09-27                                                    |

This documentation defines the product Nutrixx is intended to become. The
current repository scaffold is an implementation starting point, not evidence
that every target capability already exists.

The rendered, searchable edition is published at
<https://shari-ar.github.io/Nutrixx/>. This Markdown tree remains the canonical
source; the website is a generated presentation of it.

## Reading paths

| If you need to understand…                    | Start here                                                        |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Product promise, scope, and non-goals         | [Product constitution](product/constitution.md)                   |
| Free, Pro, Ultimate, quotas, and migration    | [Plans and entitlements](product/plans-and-entitlements.md)       |
| Required capabilities and acceptance outcomes | [Product requirements](product/requirements.md)                   |
| Domain language and lifecycle                 | [Domain documentation](domain/README.md)                          |
| System boundaries and technical strategy      | [Target architecture](architecture/target-architecture.md)        |
| Local-first operation and cloud evolution     | [Local-first architecture](architecture/local-first-evolution.md) |
| Canonical data, lineage, and versioning       | [Data architecture](data/architecture.md)                         |
| Calculations and optimization                 | [Engine documentation](engines/README.md)                         |
| API behavior                                  | [API conventions](api/conventions.md)                             |
| Security, privacy, and safety                 | [Security and privacy](security-privacy/README.md)                |
| Verification and scientific governance        | [Quality](quality/README.md)                                      |
| Production operation                          | [Operations](operations/target-operating-model.md)                |
| Delivery sequence and unresolved choices      | [Roadmap](roadmap/README.md)                                      |
| Why an architectural choice was made          | [Decision records](decisions/README.md)                           |
| Current repository automation                 | [DevOps baseline](devops.md)                                      |

## Document model

Nutrixx combines:

- arc42 for architecture concerns and quality scenarios;
- C4 for context, container, dynamic, and deployment views;
- ADRs for durable technical decisions;
- OpenAPI as the machine-readable HTTP contract;
- Diátaxis separation of explanation, reference, how-to, and tutorial content.

Every durable document MUST identify its status, owner, audience, and review
date. Normative terms **MUST**, **SHOULD**, and **MAY** use the meanings defined
by [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

## Status model

| Status        | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| Target state  | Intended end-state; implementation may not exist yet         |
| Proposed      | Review is still required before implementation depends on it |
| Accepted      | Approved source of truth                                     |
| Open decision | A named owner must resolve it before the stated gate         |
| Superseded    | Historical record retained with a link to its replacement    |

## Source-of-truth rules

- OpenAPI defines HTTP schemas and operations; prose explains conventions only.
- The plan-and-entitlement policy defines human product promises; a future
  versioned machine-readable catalog will enforce the same values at runtime.
- Accepted ADRs define architectural decisions; overview documents link to them.
- Versioned scientific policy defines calculation semantics; application code
  MUST NOT invent or silently override those rules.
- Diagrams are explanatory views. Canonical entities, interfaces, and policies
  remain machine-testable artifacts.
- Superseded guidance is never silently rewritten or left ambiguous.

## Maintenance gates

Documentation changes are reviewed with the code or policy they affect. CI
SHOULD check formatting, links, Mermaid syntax, OpenAPI validity, README
coverage, and requirement-to-test traceability. Scientific and regulatory
sources require a scheduled review rather than an assumption of permanence.

## Method references

- [arc42 documentation](https://docs.arc42.org/)
- [C4 model](https://c4model.com/diagrams)
- [Architecture Decision Records](https://adr.github.io/)
- [OpenAPI specification](https://spec.openapis.org/oas/latest.html)
- [Diátaxis documentation framework](https://diataxis.fr/)
