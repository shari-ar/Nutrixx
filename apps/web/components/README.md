# Web components

Reusable, application-local React components shared by multiple routes.

## Current shared components

| Component       | Responsibility                         |
| --------------- | -------------------------------------- |
| `Navbar`        | Responsive global navigation           |
| `StarterForm`   | Shared minimum-input onboarding form   |
| `PageHeader`    | Consistent route introduction          |
| `DashboardCard` | Accessible domain entry card           |
| `ProductIcon`   | Small product-specific icon vocabulary |
| `BrandLogo`     | Canonical brand asset rendering        |
| `ThemeSwitch`   | Light and dark appearance control      |

## Conventions

- Build on HeroUI and shared design tokens before creating custom primitives.
- Keep components accessible, typed, composable, and independent of routes.
- Keep domain calculations and direct persistence access outside UI components.
- Place route-specific components beside their route instead of here.
- Add tests for behavior, keyboard interaction, and meaningful variants.

Promote a component to a shared package only after a real cross-application use
case exists.
