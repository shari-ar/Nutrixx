# Data documentation

| Field         | Value                                        |
| ------------- | -------------------------------------------- |
| Status        | Current and target-state index               |
| Audience      | Data, application, engine, privacy engineers |
| Owner         | Nutrixx Data                                 |
| Last reviewed | 2026-10-18                                   |

| Document                                                    | Purpose                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| [Data architecture](architecture.md)                        | Stores, temporal/version model, and ownership               |
| [Canonical model](canonical-model.md)                       | Shared identifiers, quantities, observations, and snapshots |
| [Local portability](local-portability.md)                   | Editable data, complete backup, encryption, and import      |
| [Current logical ER](current-logical-er.md)                 | Implemented food, recipe, meal, and profile relationships   |
| [Current physical storage ER](current-storage-er.md)        | IndexedDB object stores and PostgreSQL adapter table        |
| [Publication and quality](publication-and-quality.md)       | Ingestion, validation, activation, and rollback             |
| [Reference completion](reference-completion.md)             | Gap identity, measured priority, and completion workflow    |
| [Agent curation prompt](agent-curation-prompt.md)           | Standard machine prompt and exact batch-output contract     |
| [First USDA catalog release](first-usda-catalog-release.md) | Reproducible first local catalog release evidence           |

The operational schemas are derived from aggregates and access patterns after
these invariants are accepted. Browser and PostgreSQL adapters implement the
same canonical contracts under different authority modes. The MVP database is
input to discovery while canonical schemas govern implementation and migration.
