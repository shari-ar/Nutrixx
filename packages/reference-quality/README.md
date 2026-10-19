# Reference quality

This package owns the storage-neutral contract for reference-data gaps and
their reproducible work priority. It covers food composition, cooking
retention, cooking yield, and intake references without importing a source
provider or a browser database.

The first policy ranks gaps against one pinned evaluation corpus. A gap with
no measured impact stays explicitly unranked. A documented critical safety
concern forms a separate priority band; the numeric score measures decision
coverage, not nutritional accuracy or physiological risk.

The food-composition queue builder creates an exact coverage candidate for
each latest food record with missing comparable component observations. It
separates absent, explicitly unknown, and unit-incompatible observations.
Its coverage review order considers mapped baseline targets first and total
missing components second. Impact remains unmeasured until replay evidence
is supplied.

The local intake contract checks proposed food, cooking, and intake-reference
observations against pinned catalog and component identities. Each surviving
claim remains pending review; invalid or ambiguous entries carry quarantine
reasons. The storage and CLI adapter lives in `scripts/stage-reference-data.mjs`.

The candidate contract requires complete, independent review decisions and
builds a deterministic, calculation-ready projection with claim provenance.
The local CLI in `scripts/build-reference-candidate.mjs` verifies raw evidence,
replays frozen next-meal requests through the active engine, and writes
content-addressed inactive candidate artifacts.

See [`src/README.md`](src/README.md) for the source map and
[reference completion](../../docs/data/reference-completion.md) for the
workflow and score interpretation.
