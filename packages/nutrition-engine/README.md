# Nutrition engine

Deterministic nutrition policy independent of HTTP, UI, persistence, and vendor
APIs. Stage 3 begins with versioned Health Context and intake-target selection.

## Intended responsibilities

- Nutrient normalization, unit conversion, aggregation, and completeness.
- Intake targets, limits, uncertainty, and confidence-aware evaluation.
- Pure domain models shared by API jobs and future offline pipelines.

## Rules

- Use explicit nutrient identifiers and units; never infer units from names.
- Make calculations deterministic, side-effect free, and thoroughly tested.
- Version scientific rules and record their sources under `docs/nutrition-model/`.
- Represent missing and estimated values explicitly; do not silently coerce zero.

The source map and public API are in [`src/README.md`](src/README.md). The
source-attributed provisional US/Canada adult DRI release lives in this package;
additional releases may be supplied by a caller. Clinical review of the
completed product precedes public launch.
