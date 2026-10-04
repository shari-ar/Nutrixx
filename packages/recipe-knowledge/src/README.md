# Recipe Knowledge source

| File                       | Responsibility                                                  |
| -------------------------- | --------------------------------------------------------------- |
| `model.ts`                 | Recipe identity, version, ingredient, yield, and result schemas |
| `decimal.ts`               | Exact rational arithmetic and versioned decimal publication     |
| `calculator.ts`            | Deterministic recipe composition calculation                    |
| `composition-resolver.ts`  | Exact food and nested-recipe composition resolution             |
| `recipe-book.ts`           | Append-only identity and immutable-version registry             |
| `index.ts`                 | Public package surface                                          |
| `recipe-knowledge.test.ts` | Versioning, calculation, and missing-data golden cases          |
