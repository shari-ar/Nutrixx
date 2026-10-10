# Development container

Reproducible VS Code environment that reuses the canonical development Compose
stack instead of maintaining a second container definition.

## Contents

| File                        | Responsibility                                                |
| --------------------------- | ------------------------------------------------------------- |
| `devcontainer.json`         | VS Code, Codespaces, ports, workspace, and lifecycle settings |
| `wait-for-api.mjs`          | Bounded readiness check after the container starts            |
| `prepare-local-catalog.mjs` | Retrieves and verifies the current offline catalog release    |

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

Opening or rebuilding the Dev Container first builds the canonical development
targets from the Compose files. Docker reuses its cache when dependency inputs
are unchanged; a changed lockfile or workspace manifest invalidates the
dependency layer and runs the locked `npm ci` automatically. The one-shot
`dev-dependencies` service then synchronizes those exact dependencies into the
named volumes used by API and Web. No lifecycle hook performs an unlocked
install.

After dependencies are ready, the lifecycle hook retrieves the approved,
immutable catalog artifact from the same-origin catalog delivery endpoint,
verifies its release receipt and SHA-256 digest, and writes it to the ignored
`apps/web/public/catalog/` runtime path. The Web application offers the
person an explicit one-click local installation into its reference cache. A
temporary delivery outage leaves the development environment usable and prints
a clear warning; retrying the Dev Container startup retries the artifact.

## GitHub Codespaces

The repository's default Codespaces configuration is this same Dev Container.
It builds and runs the canonical development Compose stack, forwards the Web
application on port `3000`, forwards the API on port `3001`, and keeps both
ports private unless the codespace owner explicitly changes their visibility.

Create a codespace from the default branch at
<https://codespaces.new/shari-ar/Nutrixx?quickstart=1>.
