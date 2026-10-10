# Recipe Knowledge source

| File                       | Responsibility                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `model.ts`                 | Recipe identity, version, ingredient, yield, nutrition, and independent output-food schemas |
| `decimal.ts`               | Exact rational arithmetic and versioned decimal publication                                 |
| `calculator.ts`            | Deterministic recipe and ingredient composition calculation                                 |
| `composition-resolver.ts`  | Exact food and nested-recipe composition resolution                                         |
| `recipe-book.ts`           | Append-only identity and immutable-version registry                                         |
| `recipe-ledger.ts`         | Atomic persistent recipe versions and independent output-food records                       |
| `index.ts`                 | Public package surface                                                                      |
| `recipe-knowledge.test.ts` | Versioning, calculation, and missing-data golden cases                                      |
| `recipe-ledger.test.ts`    | Persistent publication and immutable-history fixtures                                       |
