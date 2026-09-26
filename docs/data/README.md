# Data documentation

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| Status        | Target-state index                           |
| Audience      | Data, application, engine, privacy engineers |
| Owner         | Nutrixx Data                                 |
| Last reviewed | 2026-09-22                                   |

| Document                                              | Purpose                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| [Data architecture](architecture.md)                  | Stores, temporal/version model, and ownership               |
| [Canonical model](canonical-model.md)                 | Shared identifiers, quantities, observations, and snapshots |
| [Publication and quality](publication-and-quality.md) | Ingestion, validation, activation, and rollback             |

The operational schema is derived from aggregates and access patterns after
these invariants are accepted. The MVP database is input to discovery, not a
migration source or target schema.
