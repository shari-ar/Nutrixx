# Domain documentation

| Field         | Value                                         |
| ------------- | --------------------------------------------- |
| Status        | Target state                                  |
| Audience      | Product, engineering, data, nutrition science |
| Owner         | Nutrixx Architecture                          |
| Last reviewed | 2026-09-27                                    |

| Document                                                               | Purpose                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| [Glossary](glossary.md)                                                | Ubiquitous language and distinctions           |
| [Domain model](domain-model.md)                                        | Aggregates, ownership, invariants, and events  |
| [Workflows](workflows.md)                                              | User/system responsibilities in critical flows |
| [Provenance and uncertainty](provenance-confidence-and-uncertainty.md) | Cross-domain evidence semantics                |
| [Storage-mode lifecycle](storage-mode-lifecycle.md)                     | Verified upgrade, sync authority, downgrade, and recovery |

The MVP artifacts informed domain discovery but are not a database blueprint.
Target entities are defined from invariants and ownership rather than copied
from prototype tables.
