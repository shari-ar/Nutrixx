# Food Knowledge source

| File                       | Responsibility                                                         |
| -------------------------- | ---------------------------------------------------------------------- |
| `model.ts`                 | Versioned food, portion, composition, manifest, and payload schemas    |
| `catalog.ts`               | Release construction, validation, indexing, search, and cache loading  |
| `usda-fooddata-central.ts` | Normalization boundary for staged Foundation and SR Legacy source rows |
| `index.ts`                 | Explicit public API                                                    |
| `food-knowledge.test.ts`   | Golden domain, release, search, and IndexedDB integration fixtures     |

The package root also contains `build-usda-release.mjs`, the deterministic
operator command for producing the first compressed USDA-backed release.

All production behavior remains deterministic and independent of frameworks,
network access, and physical storage technology.
