# Data documentation

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| Status        | Current and target-state index               |
| Audience      | Data, application, engine, privacy engineers |
| Owner         | Nutrixx Data                                 |
| Last reviewed | 2026-10-07                                   |

| Document                                                    | Purpose                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| [Data architecture](architecture.md)                        | Stores, temporal/version model, and ownership               |
| [Canonical model](canonical-model.md)                       | Shared identifiers, quantities, observations, and snapshots |
| [Current logical ER](current-logical-er.md)                 | Implemented food, recipe, meal, and profile relationships   |
| [Current physical storage ER](current-storage-er.md)        | IndexedDB object stores and PostgreSQL adapter table        |
| [Publication and quality](publication-and-quality.md)       | Ingestion, validation, activation, and rollback             |
| [First USDA catalog release](first-usda-catalog-release.md) | Reproducible first local catalog release evidence           |

The operational schemas are derived from aggregates and access patterns after
these invariants are accepted. Browser and PostgreSQL adapters implement the
same canonical contracts under different authority modes. The MVP database is
input to discovery while canonical schemas govern implementation and migration.
