# Web components

Reusable, application-local React components shared by multiple routes.

## Current shared components

| Component                     | Responsibility                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `Navbar`                      | Responsive global navigation                                                           |
| `StarterForm`                 | Shared minimum-input onboarding form                                                   |
| `PageHeader`                  | Consistent route introduction                                                          |
| `DashboardCard`               | Accessible domain entry card                                                           |
| `ProductIcon`                 | Small product-specific icon vocabulary                                                 |
| `BrandLogo`                   | Canonical brand asset rendering                                                        |
| `ThemeSwitch`                 | Light and dark appearance control                                                      |
| `FoodPicker`                  | Local food and recipe reference search                                                 |
| `CatalogInstaller`            | Dashboard-only, digest-pinned catalog installation and update                          |
| `DevelopmentCatalogInstaller` | Development-only local-draft synchronization                                           |
| `FoodWorkspace`               | Food details, categories, portions, and custom-food corrections                        |
| `RecipeWorkspace`             | Versioned recipes, cooking-loss inputs, steps, and output foods                        |
| `MealWorkspace`               | Manual local meal ledger                                                               |
| `MealDetail`                  | Human-readable canonical meal nutrition and retained history                           |
| `NutrientFoodRanking`         | FDA-DV-based active-catalog ranking for one supported nutrient                         |
| `NutritionWorkspace`          | Recorded-intake results, evidence, targets, and seven-day trend                        |
| `NutritionDashboardSummary`   | Live local summary of recorded-meal composition coverage                               |
| `PlanningWorkspace`           | Ranking, shadow review, selection, consumption, and calibration                        |
| `NextMealExplanation`         | Decision path, target changes, adjacent comparison, and per-nutrient evidence dossiers |
| `NextMealProvenanceGraph`     | Interactive origin-to-ranking graph for every displayed planning value                 |
| `PaginationControls`          | Bounded previous/next navigation for large local result sets                           |
| `PlanningDashboardSummary`    | Current next-meal recommendation summary                                               |
| `OutcomeFeedbackWorkspace`    | Optional local weight and lab history, separate from intake                            |
| `Stage4AcceptanceWorkspace`   | Development-only full-catalog browser measurement                                      |

## Conventions

- Build on HeroUI and shared design tokens before creating custom primitives.
- Keep components accessible, typed, composable, and independent of routes.
- Keep domain calculations and direct persistence access outside UI components.
- Keep catalog download, verification, and installation in `CatalogInstaller`.
- Give every visible long-running browser operation progress and cancellation.
- Keep local workbench behavior in `.dev` modules excluded from production.
- Present nutrient names from the shared 112-component register; keep provider
  identifiers inside explicit provenance disclosures.
- Keep meal nutrient signatures inside the existing highlight grid: four stable
  macronutrient cards plus no more than two policy-selected contribution,
  distinctiveness, or watch-out cards.
- Place route-specific components beside their route instead of here.
- Add tests for behavior, keyboard interaction, and meaningful variants.

Promote a component to a shared package only after a real cross-application use
case exists.
