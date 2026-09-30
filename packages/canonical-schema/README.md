# @nutrixx/canonical-schema

Storage-neutral canonical data contracts shared by browser and cloud adapters.

## Version 1 scope

| Export                          | Responsibility                                                |
| ------------------------------- | ------------------------------------------------------------- |
| `CanonicalRecordV1Schema`       | Strict envelope for an integrity-sealed canonical record      |
| `CanonicalRecordDraftV1Schema`  | Strict envelope before integrity sealing                      |
| `createCanonicalRecordV1Schema` | Typed record contract for one record type and payload version |
| `QuantityV1Schema`              | Exact decimal quantity, explicit unit, basis, and precision   |
| `EvidenceFactV1Schema`          | Known/unknown evidence with provenance, quality, and lineage  |
| `DerivedSnapshotV1Schema`       | Replayable derived result with immutable dependencies         |
| `canonicalizeJson`              | RFC 8785 JSON canonicalization for deterministic hashing      |
| `canonicalRecordV1JsonSchema`   | JSON Schema Draft 2020-12 representation                      |

Schema version `1` defines meaning and serialization, not tables, object stores,
indexes, keys, or transactions. IndexedDB and future PostgreSQL adapters may
project this contract into independent physical layouts without changing it.

## Integrity flow

```text
untrusted input
  -> typed payload schema
  -> CanonicalRecordDraftV1Schema
  -> invariant validation
  -> RFC 8785 canonical JSON encoded as UTF-8
  -> SHA-256 supplied by the runtime adapter
  -> CanonicalRecordV1Schema
```

The digest covers every draft field and excludes the `integrity` object. A
consumer must validate the registered `recordType` and `recordVersion` payload,
not only the generic envelope, before accepting a domain record.

## Versioning policy

- `schemaVersion` changes only when the shared envelope or normative
  serialization changes.
- `recordVersion` changes when one registered payload contract changes.
- `logicalVersion` increases for domain revisions of one stable record ID.
- Before the first public release, schema `1` may be replaced under ADR-0006.
- After release, published schemas and migrations are immutable fixtures.

## Prohibited dependencies

This package must not import IndexedDB, OPFS, PostgreSQL, ORM, HTTP, NestJS, or
Next.js types. It may depend only on platform-neutral validation and language
primitives.
