# Web components

Reusable, application-local React components shared by multiple routes.

## Current shared components

| Component                   | Responsibility                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `Navbar`                    | Responsive global navigation                                    |
| `StarterForm`               | Shared minimum-input onboarding form                            |
| `PageHeader`                | Consistent route introduction                                   |
| `DashboardCard`             | Accessible domain entry card                                    |
| `ProductIcon`               | Small product-specific icon vocabulary                          |
| `BrandLogo`                 | Canonical brand asset rendering                                 |
| `ThemeSwitch`               | Light and dark appearance control                               |
| `FoodPicker`                | Local food and recipe reference search                          |
| `CatalogInstaller`          | Dashboard-only catalog installation                             |
| `FoodWorkspace`             | Food details, categories, portions, and custom-food corrections |
| `RecipeWorkspace`           | Versioned recipes, cooking-loss inputs, steps, and output foods |
| `MealWorkspace`             | Manual local meal ledger                                        |
| `MealDetail`                | Retained meal history and nutrition                             |
| `NutritionWorkspace`        | Recorded-intake results, evidence, targets, and seven-day trend |
| `NutritionDashboardSummary` | Live local summary of recorded-meal composition coverage        |
| `PlanningWorkspace`         | One-next-meal ranking, selection, and consumption               |
| `NextMealExplanation`       | Per-candidate score, history windows, and source trace          |
| `PlanningDashboardSummary`  | Current next-meal recommendation summary                        |
| `OutcomeFeedbackWorkspace`  | Optional local weight and lab history, separate from intake     |
| `Stage4AcceptanceWorkspace` | Development-only full-catalog browser measurement               |

## Conventions

- Build on HeroUI and shared design tokens before creating custom primitives.
- Keep components accessible, typed, composable, and independent of routes.
- Keep domain calculations and direct persistence access outside UI components.
- Keep catalog download, verification, and installation in `CatalogInstaller`.
- Place route-specific components beside their route instead of here.
- Add tests for behavior, keyboard interaction, and meaningful variants.

Promote a component to a shared package only after a real cross-application use
case exists.
