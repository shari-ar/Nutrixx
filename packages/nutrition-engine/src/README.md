# Nutrition engine source

| File                           | Responsibility                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `health-context.ts`            | Minimal, dated, non-diagnostic profile interpretation                          |
| `baseline-targets.ts`          | Source-attributed adult DRI target release for US and Canada                   |
| `energy-requirement.ts`        | Source-attributed 2023 maintenance energy estimate                             |
| `nutrient-crosswalk.ts`        | Exact USDA FDC observation-to-target concept mappings                          |
| `target-policy.ts`             | Versioned target-release validation and applicability selection                |
| `nutrition-period.ts`          | IANA nutrition-day and seven-completed-day period boundaries                   |
| `nutrition-state.ts`           | Recorded nutrient aggregation and evidence-limited comparisons                 |
| `nutrition-state-ledger.ts`    | Atomic local snapshots and correction lineage                                  |
| `nutrition-state.test.ts`      | DST, missingness, comparison, and IndexedDB replay fixtures                    |
| `nutrition-acceptance.test.ts` | Independent source, scientific, travel, and release-impact acceptance fixtures |
| `index.ts`                     | Public package surface                                                         |
| `nutrition-engine.test.ts`     | Eligibility, ambiguity, version, and target-selection fixtures                 |

The policy and calculation functions are pure. The local ledger consumes
current committed meals, records immutable daily and rolling snapshots in the
shared canonical repository, and recomputes when their inputs change. The
package uses bundled scientific policy data. The browser Nutrition workspace
presents recorded-intake results and source-scoped explanations. Stage 3
acceptance evidence and the pending human comprehension protocol are tracked
in `docs/quality/stage-3-local-nutrition-acceptance.md`.
