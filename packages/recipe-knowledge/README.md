# Recipe Knowledge

Storage-neutral contracts and deterministic application services for stable
recipe identities, immutable published versions, explicit edible yield, and
calculated nutrition.

## Responsibilities

- Preserve exact food or recipe-version references for every ingredient.
- Record input quantity, edible gram weight, preparation method, yield, and
  calculation-rule provenance.
- Publish recipe versions sequentially without mutating historical versions.
- Calculate nutrient totals, concentration, and serving values with exact
  decimal arithmetic and an explicit rounding boundary.
- Propagate missing ingredient composition into result completeness.

## Boundary

Food composition remains owned by Food Knowledge. Recipe Knowledge stores
references and calculated snapshots; Consumption records bind to the exact
published recipe version used at logging time.

See [`src/README.md`](src/README.md) for the source map.
