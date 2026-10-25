# Nutrixx-Curated Fallback Data

`claims.v1.json` is the canonical, machine-editable set of agent-produced food
composition claim records. Every record retains its batch, agent, model,
instruction digest, submitted catalog, and evidence passport while targeting
one exact food revision, preparation state, component, unit, and edible basis.

The catalog compiler projects a claim only when no known value exists from any
external provider. A newly added external provider therefore supersedes the
Nutrixx value automatically without deleting its provenance.

Agents submit batches through the internal curation API. Direct edits must pass
the same schema and catalog build checks before they are committed.
