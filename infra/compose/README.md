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

API, Web, and the VS Code development session run as root only in the local
development override so Windows bind-mounted source and generated outputs stay
writable. Only `DAC_OVERRIDE` and `FOWNER` are restored after capability
dropping, and `no-new-privileges` remains active. Production images continue
to run as the non-root `node` user with all capabilities dropped.
