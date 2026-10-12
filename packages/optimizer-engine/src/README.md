# Optimizer engine source

| File                           | Responsibility                                             |
| ------------------------------ | ---------------------------------------------------------- |
| `planning-contract.ts`         | Typed snapshot, outcome, run record, and fingerprinting    |
| `planning-contract.test.ts`    | Boundary and replay-contract fixtures                      |
| `candidate-selection.ts`       | Eligible source and portion preparation with soft signals  |
| `candidate-selection.test.ts`  | Exclusion, evidence, portion, and ordering fixtures        |
| `next-meal-candidates.ts`      | Complete next-meal census and source-backed classification |
| `next-meal-candidates.test.ts` | Coverage, safety, inventory, and manifest fixtures         |
| `local-search.ts`              | Bounded exact-hard, heuristic-soft local beam search       |
| `local-search.test.ts`         | Feasibility, limit, cancellation, and replay fixtures      |
| `plan-validation.ts`           | Independent plan validation, alternatives, and claims      |
| `plan-validation.test.ts`      | Hard-limit, exclusion, alternative, and claim fixtures     |
| `index.ts`                     | Public package surface                                     |

This table maps the current source files during Stage 4 realignment. The
accepted target is a complete, classified local-catalog ranking for one next
meal, with independently validated results and explicit consumption logging.
See the [Free next-meal contract](../../../docs/engines/next-meal-contract.md)
for the canonical engine boundary guiding subsequent source changes.
