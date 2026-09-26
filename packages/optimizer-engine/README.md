# Optimizer engine

Reserved package boundary for generating explainable food recommendations under
nutrient, preference, safety, availability, and feasibility constraints.

## Intended responsibilities

- Typed optimization inputs, constraints, objectives, and result diagnostics.
- Reproducible solver configuration and deterministic tie-breaking.
- Feasibility analysis, trade-off reporting, and confidence propagation.

## Rules

- Keep database and network access behind callers or injected adapters.
- Distinguish hard constraints from weighted objectives.
- Return infeasibility reasons instead of silently relaxing safety constraints.
- Record solver version, inputs, configuration, and model version for auditability.

Add implementation only after objective semantics and validation fixtures exist.
