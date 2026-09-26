# Nutrixx Web

Deployable Next.js and HeroUI frontend for Nutrixx. It owns browser-facing
routing, presentation, accessibility, and interaction with the public API.

## Directory map

| Path          | Responsibility                                              |
| ------------- | ----------------------------------------------------------- |
| `app/`        | App Router routes, layouts, providers, and route boundaries |
| `components/` | Reusable application UI components                          |
| `config/`     | Web-only static metadata and navigation configuration       |
| `public/`     | Static assets served without transformation                 |
| `styles/`     | Global CSS entry points and design-system integration       |
| `types/`      | Web-only TypeScript types                                   |

## Local development

From the repository root:

```bash
npm ci
npm run dev --workspace=@nutrixx/web
```

Runtime settings are loaded from the repository root `.env` file. Start by
copying `.env.example` to `.env` from the repository root.

The web app runs on `http://localhost:3000` and expects the API at the URL set
by `NEXT_PUBLIC_API_URL`.

## Checks

```bash
npm run check --workspace=@nutrixx/web
```

## Boundaries

- Prefer Server Components; add `'use client'` only at interactive boundaries.
- Keep environment validation in `@nutrixx/config`.
- Do not duplicate API schemas as handwritten frontend types.
- Keep domain calculations outside React components.
