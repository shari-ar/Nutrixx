# Docker Compose

Canonical service topology for development and production-like verification.

## Files

| File                | Responsibility                                                |
| ------------------- | ------------------------------------------------------------- |
| `compose.yaml`      | Secure production-like defaults, images, health, and ordering |
| `compose.dev.yaml`  | Development targets, bind mounts, watchers, and commands      |
| `compose.test.yaml` | Ephemeral PostgreSQL contract-test dependency                 |

## Commands

```bash
npm run docker:config
npm run dev
npm run docker:up
npm run docker:down
npm run docker:test:postgres:up
npm run docker:test:postgres:down
```

The PostgreSQL test service uses an ephemeral `tmpfs` data directory and a
loopback-only port. With it running, set `TEST_DATABASE_URL` to
`postgresql://nutrixx_contract:nutrixx_contract@127.0.0.1:55432/nutrixx_contract`
and run `npm run test:contract:postgres`.

Keep the base file deployable and environment-neutral. Development-only mounts
and commands belong in the override. Add dependencies with health-based startup
conditions, explicit persistence, and documented failure behavior.

The development override stores each workspace's `node_modules` in named
volumes so the Windows bind mount cannot replace Linux dependencies. Before the
API starts, the one-shot `dev-dependencies` service compares a dependency
fingerprint built from the lockfile, manifests, package manager, runtime, and
platform, then synchronizes stale volumes from the already-built development
image. It does not run `npm install` or access the network.

After dependency synchronization, the one-shot `dev-workspace` service runs the
root `build:packages` contract. API, Web, and Radar depend on its successful
completion, so a clean clone cannot start an application against missing
workspace `dist/` exports. The same package-build contract is reused by the
root build and production Web image.

API, Web, and the VS Code development session run as root only in the local
development override so Windows bind-mounted source and generated outputs stay
writable. Only `DAC_OVERRIDE` and `FOWNER` are restored after capability
dropping, and `no-new-privileges` remains active. Production images continue
to run as the non-root `node` user with all capabilities dropped.

The development override also starts the internal Data Quality Radar at
`http://localhost:3002/` as its own service. It is available with ordinary
`npm run dev` as well as the Dev Container, and its host port is bound to
loopback only. Its same-origin proxy submits agent-curation result files to the
API and follows persisted run status while keeping the shared bearer token on
the local server path. The API creates a workspace-local 256-bit token in
ignored storage and both services receive the same token-file path. The
production Compose file does not expose this operator tool.

Every successful Agent batch updates only the workspace-local catalog draft.
When an operator confirms release preparation on port `3002`, the server uses a
local fine-grained `NUTRIXX_GITHUB_TOKEN`; the token is never sent to the
browser. The publisher verifies the artifact and receipt, uploads both to a
draft GitHub Release, and opens a pull request containing only the active
catalog pointer. GitHub Actions publishes and merges them only after the catalog
and required repository checks succeed.
