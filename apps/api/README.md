# Nutrixx API

Deployable NestJS HTTP service for Nutrixx. It owns transport concerns,
application orchestration, runtime validation, and implementation of the public
OpenAPI contract.

## Directory map

| Path                | Responsibility                                            |
| ------------------- | --------------------------------------------------------- |
| `src/`              | Application bootstrap, modules, controllers, and services |
| `test/`             | Black-box end-to-end tests                                |
| `rspack.config.mjs` | Minified production bundle with private source maps       |
| `nest-cli.json`     | Nest build and source-root configuration                  |
| `vitest.config*.ts` | Unit and end-to-end test projects                         |

## Local development

From the repository root:

```bash
npm ci
npm run start:dev --workspace=@nutrixx/api
```

Runtime settings are loaded from the repository root `.env` file. Start by
copying `.env.example` to `.env` from the repository root.

The API listens on `http://localhost:3001/api/v1` by default.

## Initial endpoints

- `GET /api/v1` — service identity and contract version
- `GET /api/v1/health` — lightweight health check for orchestration

## Checks

```bash
npm run check --workspace=@nutrixx/api
```

## Boundaries

- Keep controllers thin; domain calculations belong in reusable packages.
- Validate runtime configuration through `@nutrixx/config`.
- Change `packages/contracts/openapi/` before changing public HTTP behavior.
- Do not import code from `apps/web` or access frontend implementation details.
