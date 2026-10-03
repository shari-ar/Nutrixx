# IndexedDB adapter source

This directory contains the versioned schema runner, the canonical record
adapter, and executable atomicity/recovery tests. Schema version `1` is the only
pre-release baseline: unsupported transitions fail closed instead of silently
rewriting local authority data.

| File                           | Responsibility                                  |
| ------------------------------ | ----------------------------------------------- |
| `crypto.ts`                    | Web Crypto SHA-256 adapter                      |
| `indexeddb-repository.ts`      | User authority, atomic log, and export/import   |
| `export-import.test.ts`        | Integrity, replacement, and rollback fixtures   |
| `reference-cache.ts`           | Separate immutable reference-release cache      |
| `reference-cache.test.ts`      | Isolation, integrity, activation, and LRU tests |
| `indexeddb-repository.test.ts` | Shared repository contract-suite binding        |
| `index.ts`                     | Explicit public exports                         |
