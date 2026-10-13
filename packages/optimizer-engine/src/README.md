# Optimizer engine source

| File                           | Responsibility                                             |
| ------------------------------ | ---------------------------------------------------------- |
| `next-meal-candidates.ts`      | Complete next-meal census and source-backed classification |
| `next-meal-candidates.test.ts` | Coverage, safety, inventory, and manifest fixtures         |
| `next-meal-ranking.ts`         | Exact, history-aware scoring and deterministic total order |
| `next-meal-ranking.test.ts`    | Window, completeness, portion, and ordering fixtures       |
| `next-meal-validation.ts`      | Independent census, safety, score, and explanation audit   |
| `next-meal-validation.test.ts` | Tampering, history, exclusion, and explanation fixtures    |
| `index.ts`                     | Public package surface                                     |

The active Free planner ranks a complete classified local catalog for one next
meal. Its result is independently validated before user presentation and
explicit consumption logging.
See the [Free next-meal contract](../../../docs/engines/next-meal-contract.md)
for the canonical engine boundary guiding subsequent source changes.
