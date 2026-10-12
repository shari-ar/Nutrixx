# Optimizer engine

This package owns the storage-neutral Free next-meal recommendation engine.
Stage 4 steps 3–5 align typed snapshots, classified full-catalog candidates,
deterministic ranking, independent validation, replay evidence, and
evidence-linked explanations with the accepted target design. The current
source is an in-progress implementation; the target contract is defined by
the [Stage 4 decisions](../../docs/decisions/README.md).

The source map is in [`src/README.md`](src/README.md). The accepted ADRs and
[Free next-meal contract](../../docs/engines/next-meal-contract.md) govern
normative behavior.

## Rules

- Keep database and network access behind callers or injected adapters.
- Keep hard constraints distinct from weighted objectives.
- Preserve input, policy, engine, and solver versions for reproducible runs.
- Return explicit feasibility and search-limit diagnostics.
