# API source

Production source code for the NestJS service.

## Current files

| File                | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `main.ts`           | Environment loading, application creation, and listening |
| `app.config.ts`     | Global prefix, CORS, validation, and cross-cutting setup |
| `app.module.ts`     | Root dependency graph                                    |
| `app.controller.ts` | Initial public HTTP routes                               |
| `app.service.ts`    | Initial application responses                            |
| `*.spec.ts`         | Unit tests beside the behavior they verify               |

## Conventions

- Organize future capabilities by domain module, not technical layer alone.
- Keep controllers transport-focused and inject application services.
- Validate external input at boundaries and return contract-shaped responses.
- Avoid hidden global state, direct environment reads, and cross-domain imports.
- Keep unit tests deterministic and colocated with source.
