# Development container

Reproducible VS Code environment that reuses the canonical development Compose
stack instead of maintaining a second container definition.

## Contents

| File                           | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `devcontainer.json`            | VS Code, Codespaces, ports, workspace, and lifecycle settings  |
| `wait-for-api.mjs`             | Bounded readiness check after the container starts             |
| `prepare-local-catalog.mjs`    | Retrieves and verifies the current offline catalog release     |
| `start-data-quality-radar.mjs` | Builds the local radar report and starts its preview server    |
| `serve-data-quality-radar.mjs` | Serves the generated local radar, work queue, and JSON reports |

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
The tracked active-release descriptor selects the exact catalog. A reviewed
release carries immutable artifact and receipt URLs; the DevContainer checks
the receipt and descriptor-pinned SHA-256 before making it available for
browser installation. HTTP 403 remains a hard stop for acquisition.

The development Compose stack runs the internal data quality radar and
food-composition work queue as a dedicated service on port `3002`.
VS Code and GitHub Codespaces forward that port and open the report in a browser
automatically. The report links to
the searchable queue at `/queue`. The Web application
continues to use port `3000`. A catalog or report error opens a clear local
status page instead of displaying a stale report. Neither the preview server nor
the generated report is part of the production Compose stack or public website.

## GitHub Codespaces

The repository's default Codespaces configuration is this same Dev Container.
It builds and runs the canonical development Compose stack, forwards the Web
application on port `3000`, forwards the API on port `3001`, and opens the data
quality radar on port `3002`. All three ports remain private unless the
codespace owner explicitly changes their visibility.

Create a codespace from the default branch at
<https://codespaces.new/shari-ar/Nutrixx?quickstart=1>.
