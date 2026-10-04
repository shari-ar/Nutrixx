# Data documentation

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| Status        | Target-state index                           |
| Audience      | Data, application, engine, privacy engineers |
| Owner         | Nutrixx Data                                 |
| Last reviewed | 2026-09-27                                   |

| Document                                              | Purpose                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| [Data architecture](architecture.md)                  | Stores, temporal/version model, and ownership               |
| [Canonical model](canonical-model.md)                 | Shared identifiers, quantities, observations, and snapshots |
| [Publication and quality](publication-and-quality.md) | Ingestion, validation, activation, and rollback             |

The operational schemas are derived from aggregates and access patterns after
these invariants are accepted. Browser and PostgreSQL adapters implement the
same canonical contracts under different authority modes. The MVP database is
input to discovery while canonical schemas govern implementation and migration.
