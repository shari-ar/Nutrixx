# Nutrixx API contracts

`openapi/nutrixx.openapi.yaml` is the source of truth for the public HTTP API.
Application code must implement this contract; generated output must not replace
the source document.

## Contents

| Path           | Responsibility                                    |
| -------------- | ------------------------------------------------- |
| `openapi/`     | Authored, reviewable API source contracts         |
| `dist/`        | Generated bundled contracts; never edit or commit |
| `package.json` | Contract lint and bundle commands                 |

## Change workflow

1. Update the OpenAPI document before implementation.
2. Run `npm run contract:lint` from the repository root.
3. Review compatibility and bump both contract versions when behavior changes.
4. Run `npm run contract:build` to produce the distributable bundled contract.

Breaking changes require a new API base version. Generated files under `dist/`
are build artifacts and are not committed.

## Boundaries

- Contracts describe public behavior, not NestJS implementation details.
- Examples must be valid, realistic, and free of private or health data.
- Reusable schemas belong under `components.schemas` rather than inline copies.
