# Nutrition engine

Reserved package boundary for deterministic nutrition calculations independent
of HTTP, UI, persistence, and vendor APIs.

## Intended responsibilities

- Nutrient normalization, unit conversion, aggregation, and completeness.
- Intake targets, limits, uncertainty, and confidence-aware evaluation.
- Pure domain models shared by API jobs and future offline pipelines.

## Rules

- Use explicit nutrient identifiers and units; never infer units from names.
- Make calculations deterministic, side-effect free, and thoroughly tested.
- Version scientific rules and record their sources under `docs/nutrition-model/`.
- Represent missing and estimated values explicitly; do not silently coerce zero.

Add implementation only after its first public API and invariants are designed.
