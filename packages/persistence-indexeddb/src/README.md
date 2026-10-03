# IndexedDB adapter source

This directory contains the versioned schema runner, the canonical record
adapter, and executable atomicity/recovery tests. Schema version `1` is the only
pre-release baseline: unsupported transitions fail closed instead of silently
rewriting local authority data.

| File                           | Responsibility                |
| ------------------------------ | ----------------------------- |
| `indexeddb-repository.ts`      | Native transactional adapter  |
| `indexeddb-repository.test.ts` | Shared contract-suite binding |
| `index.ts`                     | Explicit public export        |
