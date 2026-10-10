# Nutrition engine source

| File                       | Responsibility                                                  |
| -------------------------- | --------------------------------------------------------------- |
| `health-context.ts`        | Minimal, dated, non-diagnostic profile interpretation           |
| `baseline-targets.ts`      | Source-attributed adult DRI target release for US and Canada    |
| `energy-requirement.ts`    | Source-attributed 2023 maintenance energy estimate              |
| `nutrient-crosswalk.ts`    | Exact USDA FDC observation-to-target concept mappings           |
| `target-policy.ts`         | Versioned target-release validation and applicability selection |
| `index.ts`                 | Public package surface                                          |
| `nutrition-engine.test.ts` | Eligibility, ambiguity, version, and target-selection fixtures  |

This package is pure domain logic. It ships a provisional adult DRI release,
accepts other versioned releases from a caller, and never fetches scientific
data or stores user facts. The Stage 3 Nutrition State aggregation and
presentation belong to later work packages.
