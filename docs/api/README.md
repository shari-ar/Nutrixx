# API documentation

| Field         | Value                       |
| ------------- | --------------------------- |
| Status        | Target-state index          |
| Audience      | API producers and consumers |
| Owner         | Nutrixx API Engineering     |
| Last reviewed | 2026-09-27                  |

The machine-readable source of truth remains
`packages/contracts/openapi/nutrixx.openapi.yaml`. The
[API conventions](conventions.md) define behavior that spans operations without
copying schemas from OpenAPI.

Local workflows do not require HTTP. The contract covers cloud capabilities;
storage-neutral domain commands and result types are shared separately.

## Rules

- Never redefine schemas already expressed in OpenAPI.
- Keep examples synchronized with contract tests.
- Use fictional, non-sensitive nutrition and health data.
- Version migration documents alongside public API changes.
- Validate the chosen OpenAPI version against the full generator, linter,
  documentation, gateway, and NestJS toolchain before adoption.
