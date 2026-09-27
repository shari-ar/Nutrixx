# ADR-0003: Shared canonical model across browser and cloud

| Field                      | Value                                         |
| -------------------------- | --------------------------------------------- |
| Status                     | Proposed                                      |
| Date                       | 2026-09-27                                    |
| Deciders                   | Architecture, Domain, Data, Web, API          |
| Owner                      | Nutrixx Architecture                          |
| Related requirements       | FR-003–FR-012, FR-015, FR-017, QR-002, QR-015 |
| Supersedes / superseded by | None                                          |

## Context and problem

Local and cloud modes store the same user concepts in different technologies.
Independent models would drift, make promotion lossy, change scientific output
by plan, and multiply correction/migration logic.

## Decision drivers

- Equivalent nutrition meaning and calculation across plans.
- Lossless upgrade, downgrade, export, import, and replay.
- Storage-technology independence for domain and engine packages.
- Versioned evolution with deterministic conformance evidence.

## Considered options

1. Separate browser and server schemas with mapping at migration time.
2. Server schema mirrored directly into IndexedDB tables.
3. One storage-neutral canonical contract with adapter-specific physical models.

## Decision

Adopt option 3. Stable canonical identifiers, value objects, aggregate/event
contracts, serialization rules, schema versions, and migration semantics are
shared. IndexedDB/OPFS and PostgreSQL use independent physical layouts behind
conforming repositories. Framework, transport, and database types cannot leak
into canonical domain contracts.

Decimals, units, timestamps/timezones, unknown reasons, provenance, immutable
versions, and fingerprints have one normative serialization. Every migration
declares supported source/target versions and downgrade/export behavior.

## Consequences

### Positive

- Plan changes do not reinterpret user facts.
- Domain/engine fixtures run identically against local and cloud adapters.
- Portable bundles are durable contracts rather than database dumps.
- Physical stores can optimize independently.

### Negative / trade-offs

- Canonical evolution requires stricter compatibility discipline.
- Browser constraints must be considered in schema and migration design.
- Some database-native features need adapter projections rather than domain use.

## Validation and review triggers

CI runs shared repository contracts, serialization round trips, golden
calculations, migration fixtures, and export/import equivalence across both
adapters. Any mode-specific semantic exception requires a new ADR and explicit
user-visible consequence.

