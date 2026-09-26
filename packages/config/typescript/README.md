# Shared TypeScript presets

Composable compiler-policy layers exported by `@nutrixx/config`.

## Presets

| File          | Responsibility                                         |
| ------------- | ------------------------------------------------------ |
| `strict.json` | Runtime-independent correctness and safety baseline    |
| `node.json`   | Node.js ESM runtime profile layered on strict defaults |

Applications own framework libraries, output directories, path aliases, and
emit behavior. New shared rules must be compatible across all consumers and
validated with every workspace type check.
