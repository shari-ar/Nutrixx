# Infrastructure

Runtime packaging and infrastructure definitions for local, CI, and future
hosted environments.

## Sections

| Path         | Responsibility                                        |
| ------------ | ----------------------------------------------------- |
| `docker/`    | Multi-stage application image definition              |
| `compose/`   | Local and production-like multi-service orchestration |
| `terraform/` | Future reviewed infrastructure as code                |

## Rules

- Keep application business logic out of infrastructure definitions.
- Pin deployable artifacts and make environment differences explicit.
- Never commit credentials, state files, or provider cache directories.
- Every change must have validation, health, rollback, and ownership implications
  considered before deployment automation is added.
