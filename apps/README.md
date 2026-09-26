# Applications

Deployable process boundaries of the Nutrixx monorepo.

## Workspaces

| Path   | Runtime           | Responsibility                                |
| ------ | ----------------- | --------------------------------------------- |
| `api/` | Node.js / NestJS  | Public HTTP API and application orchestration |
| `web/` | Node.js / Next.js | Browser application and user experience       |

## Dependency direction

Applications may depend on `packages/*`; shared packages must never depend on
applications. Cross-application imports are prohibited. Communication between
deployable applications must use an explicit contract such as OpenAPI.

Each application owns its framework configuration and tests while inheriting
shared policies from `@nutrixx/config`.
