# Development container

Reproducible VS Code environment that reuses the canonical development Compose
stack instead of maintaining a second container definition.

## Contents

| File                           | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `devcontainer.json`            | VS Code, Codespaces, ports, workspace, and lifecycle settings  |
| `compose.devcontainer.yaml`    | Reuses the images built by initialization without rebuilding   |
| `wait-for-services.mjs`        | Bounded readiness checks for API, Web, and Radar               |
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
named volumes used by API and Web. The one-shot `dev-workspace` service builds
every shared workspace package from the clean checkout before API, Web, or
Radar can start. This build barrier guarantees that package exports backed by
`dist/` exist in fresh Codespaces as well as local Dev Containers. No lifecycle
hook performs an unlocked install. The initialization command evaluates those
same Compose files through
Buildx Bake and grants read access only to the repository's shared Dockerfile.
This narrow entitlement supports recent Buildx filesystem isolation without
granting access to any path outside the build input. The Dev Container also
normalizes the two selected targets to the repository-root context because Bake
otherwise resolves the Compose files' `../..` context from its invocation
directory rather than from `infra/compose/`. After initialization, the
DevContainer-only Compose override removes the three redundant service build
definitions. VS Code therefore starts the exact images produced from the
canonical Compose targets instead of asking Compose to build them a second time.

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
The queue page can accept a local food-names text/JSON file and return a
validated `agent-task-packet.json`. Upload bytes are processed in memory with a
256 KiB limit and are not retained by the preview service.
It can also submit the completed agent batch to the local curation API and
follow the persistent run status. The API creates a workspace token in the
ignored `.temp` directory and the proxy uses it exclusively on the local server
path. Agent-result uploads are limited to 16 MiB and are retained by the API's
ignored local run workspace for audit and failure recovery.
Repeated successful uploads advance one identity-bearing local draft while all
outstanding Agent packets remain valid against the session's immutable base.
DevContainer startup uses that verified draft directly and avoids replacing or
downloading the published artifact while the session is open.
Port `3000` polls, verifies, and activates the current draft automatically and
displays `Using Local Draft` while that exact revision is active. The queue
exposes one confirmed catalog-release action. It is enabled only when a local
GitHub token is configured and prepares a draft GitHub Release plus a reviewable
catalog pointer pull request. GitHub Actions verifies the exact artifact and
receipt, publishes the Release, and merges the pointer only after all required
checks pass.

## GitHub Codespaces

The repository's default Codespaces configuration is this same Dev Container.
It builds and runs the canonical development Compose stack, forwards the Web
application on port `3000`, forwards the API on port `3001`, and opens the data
quality radar on port `3002`. Startup waits until all three services answer
their readiness checks. All three ports remain private unless the
codespace owner explicitly changes their visibility.

Create a codespace from the default branch at
<https://codespaces.new/shari-ar/Nutrixx?quickstart=1>.
