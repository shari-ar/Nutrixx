# Web application routes

Next.js App Router tree, including route UI, layouts, providers, loading/error
boundaries, and route-level metadata.

## Current files

| File            | Responsibility                                   |
| --------------- | ------------------------------------------------ |
| `layout.tsx`    | Root document, metadata, fonts, and shared shell |
| `page.tsx`      | Initial landing route                            |
| `providers.tsx` | Client-side provider boundary                    |
| `error.tsx`     | Route error recovery UI                          |
| `page.test.tsx` | User-visible landing-page behavior               |

## Conventions

- Use Server Components by default and minimize client boundaries.
- Keep route segments cohesive; colocate route-only tests and components.
- Provide accessible loading, empty, not-found, and error states.
- Fetch through contract-aware clients rather than ad hoc request shapes.
