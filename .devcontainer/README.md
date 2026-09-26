# Development container

Reproducible VS Code environment that reuses the canonical development Compose
stack instead of maintaining a second container definition.

## Contents

| File                | Responsibility                                              |
| ------------------- | ----------------------------------------------------------- |
| `devcontainer.json` | VS Code attachment, workspace, user, and lifecycle settings |
| `wait-for-api.mjs`  | Bounded readiness check after the container starts          |

## Operating rules

- Compose files under `infra/compose/` remain the runtime source of truth.
- Keep lifecycle commands non-interactive, repeatable, and safe to rerun.
- Do not install dependencies globally or duplicate versions from `package.json`.
- Never place credentials, tokens, or machine-specific absolute paths here.

The local development services and VS Code session use `root` because Docker
Desktop exposes Windows bind-mounted project directories as root-owned and not
writable by the image's `node` user. Linux capabilities remain dropped by
Compose except for the development-only `DAC_OVERRIDE` and `FOWNER` file
capabilities, `no-new-privileges` remains enabled, and production images still
run as the non-root `node` user.

Rebuild the Dev Container after changing its configuration, Docker stages, or
the dependency lockfile.
