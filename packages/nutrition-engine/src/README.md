# Nutrition engine source

| File                        | Responsibility                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `health-context.ts`         | Minimal, dated, non-diagnostic profile interpretation           |
| `baseline-targets.ts`       | Source-attributed adult DRI target release for US and Canada    |
| `energy-requirement.ts`     | Source-attributed 2023 maintenance energy estimate              |
| `nutrient-crosswalk.ts`     | Exact USDA FDC observation-to-target concept mappings           |
| `target-policy.ts`          | Versioned target-release validation and applicability selection |
| `nutrition-period.ts`       | IANA nutrition-day and seven-completed-day period boundaries    |
| `nutrition-state.ts`        | Recorded nutrient aggregation and evidence-limited comparisons  |
| `nutrition-state-ledger.ts` | Atomic local snapshots and correction lineage                   |
| `nutrition-state.test.ts`   | DST, missingness, comparison, and IndexedDB replay fixtures     |
| `index.ts`                  | Public package surface                                          |
| `nutrition-engine.test.ts`  | Eligibility, ambiguity, version, and target-selection fixtures  |

The policy and calculation functions are pure. The local ledger consumes
current committed meals, records immutable daily and rolling snapshots in the
shared canonical repository, and recomputes when their inputs change. The
package never fetches scientific data. User-facing presentation belongs to a
later Stage 3 work package.
