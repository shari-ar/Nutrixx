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
- Freeze one nominal scenario and explicit stress perturbations; retain exact
  per-scenario values behind every robust aggregate.
- Evaluate a versioned terminal tail after the decision horizon while
  publishing exclusively the next action.
- Return explicit feasibility and search-limit diagnostics.
- Process full-catalog classification and scoring in deterministic chunks while
  preserving byte-for-byte-equivalent ranking results and reporting real
  processed-entry progress.
- Benchmark real classification and scoring work independently, then adapt
  chunk sizes within bounded limits to the current device while targeting
  short worker tasks. Callers may seed separate phase hints; the engine still
  measures every run and treats each hint as a starting point only.
- Project an independently approved ranking to exact `candidateKey`, `rank`, and
  `score` rows before persistence or UI transfer; detailed computation remains
  transient review evidence rather than duplicated result state.
