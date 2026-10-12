# Optimizer engine

This package owns the versioned, storage-neutral Free local planning contract.
Stage 4 steps 2 and 3 define typed input snapshots, typed outcomes, immutable
run records, candidate preparation, eligibility, and hard/soft separation.
Search, independent validation, persistence adapters, and user views arrive in
their dedicated Stage 4 steps.

The source map is in [`src/README.md`](src/README.md). The normative behavior
is in the accepted Stage 4 ADRs and the
[local planning contract](../../docs/engines/local-planning-contract-v1.md).

## Rules

- Keep database and network access behind callers or injected adapters.
- Keep hard constraints distinct from weighted objectives.
- Preserve input, policy, engine, and solver versions for reproducible runs.
- Return explicit feasibility and search-limit diagnostics.
