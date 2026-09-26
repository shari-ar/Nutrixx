# Docker images

Single multi-stage Dockerfile for development, verification, and minimal runtime
images.

## Stages

| Stage                    | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `base`                   | Pinned Node runtime and package manifests             |
| `dependencies`           | Reproducible full workspace restore                   |
| `development`            | Non-root Dev Container and Compose development target |
| `source`                 | Full source for verification and builds               |
| `verify`                 | Repository quality gate inside Docker                 |
| `api-build`, `web-build` | Production application builds                         |
| `api`, `web`             | Non-root runtime images                               |

## Rules

- Pin the base tag and digest; Dependabot owns routine updates.
- Preserve layer caching by copying manifests before source.
- Do not bake secrets or `.env` files into any layer.
- Keep runtime images non-root and free of development dependencies.
