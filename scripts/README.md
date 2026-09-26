# Repository scripts

Small, cross-platform automation used by contributors and CI.

## Contents

| File                    | Responsibility                                                   |
| ----------------------- | ---------------------------------------------------------------- |
| `check-readmes.mjs`     | Enforces README presence in project-owned directories            |
| `run-with-node-env.mjs` | Runs a command with an explicit, cross-platform Node environment |

## Rules

- Prefer Node.js standard-library scripts for Windows/Linux parity.
- Make scripts non-interactive, deterministic, idempotent, and fail-fast.
- Resolve paths from the script or repository root, never the caller's machine.
- Print actionable errors and use non-zero exit codes on policy failures.
- Keep business logic in packages and deployment logic in infrastructure tooling.
