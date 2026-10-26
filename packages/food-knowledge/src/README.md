# Food Knowledge source

| File                              | Responsibility                                                               |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `model.ts`                        | Versioned food, value-level Agent provenance, manifest, and payload schemas  |
| `catalog.ts`                      | Release construction, validation, indexing, search, and cache loading        |
| `identity.ts`                     | Data-driven source priority, reviewed links, and pending identity decisions  |
| `identity-reconciliation.ts`      | Source-independent canonical identity consolidation across every source      |
| `data-quality-radar.ts`           | Catalog-only coverage, provenance, freshness, and comparison-readiness audit |
| `custom-food.ts`                  | Versioned user foods, categories, portions, and atomic persistence           |
| `usda-fooddata-central.ts`        | Normalization boundary for staged Foundation and SR Legacy source rows       |
| `index.ts`                        | Explicit public API                                                          |
| `food-knowledge.test.ts`          | Golden domain, release, search, and IndexedDB integration fixtures           |
| `identity.test.ts`                | Identity precedence, changed-source, and conflict fixtures                   |
| `identity-reconciliation.test.ts` | Exact merge, variant separation, and fallback-order fixtures                 |
| `custom-food.test.ts`             | Version history, active-head, and atomic persistence fixtures                |
| `data-quality-radar.test.ts`      | Missing-versus-zero, source-age, and comparison-readiness fixtures           |

The package root also contains `build-usda-release.mjs`, the deterministic
operator command for producing the first compressed USDA-backed release.

All production behavior remains deterministic and independent of frameworks,
network access, and physical storage technology.
