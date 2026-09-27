# Git hooks

| Field         | Value                                 |
| ------------- | ------------------------------------- |
| Purpose       | Fail-closed local commit quality gate |
| Owner         | Nutrixx Engineering                   |
| Last reviewed | 2026-09-27                            |

`pre-commit` formats every supported staged file with the repository-locked
Prettier version and restages the result safely. Filenames are passed as a
null-delimited stream, so spaces and Unicode paths remain safe.

Execution order:

1. use the local locked npm toolchain when available;
2. otherwise use the running `api` DevContainer;
3. otherwise block the commit with recovery instructions.

Husky is installed by the root `prepare` lifecycle through
`scripts/install-git-hooks.mjs`. CI, production installs, and Docker build
contexts without `.git` skip hook installation; CI independently enforces
`npm run format:check` and cannot be bypassed by a local hook override.
The generated, ignored `.husky/_` runtime is excluded from the project-owned
directory README policy.

Do not place secrets, network authentication, destructive commands, or the
full test suite in a Git hook. Keep it fast, deterministic, and limited to
staged content.
