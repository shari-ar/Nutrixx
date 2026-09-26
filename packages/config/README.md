# @nutrixx/config

Shared, versioned configuration primitives for every Nutrixx workspace.

## Contents

| Path                | Responsibility                                   |
| ------------------- | ------------------------------------------------ |
| `environment.mjs`   | Zod runtime-environment contracts                |
| `environment.d.mts` | Public type declarations for environment helpers |
| `prettier.mjs`      | Repository formatting policy                     |
| `typescript/`       | Composable TypeScript presets                    |
| `vitest.mjs`        | Shared deterministic test defaults               |
| `vitest.d.mts`      | Public declarations for the Vitest preset        |

Application-specific emit, framework, test, and path settings stay in each
workspace so shared presets do not hide runtime behavior.

## Change rules

- Prefer additive presets over framework-specific conditionals.
- Treat stricter rules as potentially breaking changes for every workspace.
- Keep runtime exports platform-neutral unless the export name states otherwise.
- Update declaration files and this README with every public export change.
