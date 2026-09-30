# Canonical schema source

| File                | Responsibility                                          |
| ------------------- | ------------------------------------------------------- |
| `canonical-json.ts` | Deterministic RFC 8785 serialization                    |
| `primitives.ts`     | Identifiers, timestamps, decimals, and JSON-safe values |
| `value-objects.ts`  | Quantities, evidence, provenance, and snapshots         |
| `record.ts`         | Version 1 record envelope, integrity, and invariants    |
| `schema-v1.ts`      | Draft 2020-12 JSON Schema export                        |
| `index.ts`          | Explicit public API                                     |
| `schema-v1.test.ts` | Conformance and rejection fixtures                      |

Keep all source independent of storage and application frameworks. Add a
record-specific schema through the exported factory and preserve a golden
fixture before an adapter is allowed to persist that record type.
