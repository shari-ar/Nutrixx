# HiGHS solver adapter

This package owns the Nutrixx adapter for the HiGHS WebAssembly mixed-integer
solver. It translates a validated solver-neutral Planning Decision Chain into
an independent binary MILP, runs the model locally, and returns a separately
validated shadow Decision Chain plus canonical execution evidence.

## Rules

- Keep nutrition policy and scoring inside `@nutrixx/optimizer-engine`.
- Consume only the solver-neutral Planning Decision Chain contract.
- Preserve the primary solver as the exclusive publication authority.
- Run browser solves inside a disposable Web Worker.
- Pin the HiGHS package and served WebAssembly asset to one exact version.
- Record model digest, solver identity, solve status, objective, and dimensions.
- Treat every WebAssembly allocation as an explicit lifecycle responsibility.

The source map is documented in [`src/README.md`](src/README.md).
