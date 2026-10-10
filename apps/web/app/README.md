# Web application routes

Next.js App Router tree, including route UI, layouts, providers, loading/error
boundaries, and route-level metadata.

## Current files

| File            | Responsibility                                   |
| --------------- | ------------------------------------------------ |
| `layout.tsx`    | Root document, metadata, fonts, and shared shell |
| `page.tsx`      | Product landing route and shared starter form    |
| `providers.tsx` | Client-side provider boundary                    |
| `error.tsx`     | Route error recovery UI                          |
| `page.test.tsx` | User-visible landing-page behavior               |

## Route map

| Route             | Responsibility                                             |
| ----------------- | ---------------------------------------------------------- |
| `/start`          | Dedicated starting-profile form                            |
| `/dashboard`      | Daily overview and domain entry points                     |
| `/meals`          | Local meal ledger, manual logging, correction, and removal |
| `/meals/[mealId]` | Retained item snapshots and revision history               |
| `/foods`          | Reference catalog installation, search, and custom foods   |
| `/recipes`        | Versioned local recipes with exact ingredient references   |
| `/nutrition`      | Action-oriented nutrient coverage                          |
| `/activity`       | Activity, sleep, and recovery context                      |
| `/hydration`      | Water intake and target detail                             |
| `/settings`       | Profile, local data, backup, and advanced controls         |

## Conventions

- Use Server Components by default and minimize client boundaries.
- Keep route segments cohesive; colocate route-only tests and components.
- Provide accessible loading, empty, not-found, and error states.
- Fetch through contract-aware clients rather than ad hoc request shapes.
