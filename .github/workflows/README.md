# GitHub Actions workflows

Required continuous-integration definitions for pull requests, merge queues,
manual verification, and pushes to `main`.

## Current workflows

`ci.yml` provides four coordinated gates:

1. `Security gates` scans full Git history for secrets and applies the
   risk-based dependency vulnerability policy.
2. `Quality gate` restores the lockfile and runs documentation, formatting,
   dead-code, duplication, lint, tests, contract bundling, type checks, and
   production builds.
3. `Container smoke test` builds both runtime images, waits for health, probes
   API/Web endpoints, prints failure diagnostics, and always cleans up.
4. `PostgreSQL persistence contract` verifies the shared repository contract
   after both security and quality succeed.

`docs.yml` builds the VitePress site for documentation pull requests and
deploys it to the protected `github-pages` environment after documentation
changes reach `main`. The build uses full Git history for accurate page-update
timestamps, uploads only the generated site, and grants deployment permissions
only to the deployment job.

`catalog-release.yml` runs only after a successful pull-request CI workflow. Its
trusted finalizer accepts only automation-owned catalog branches and the two
catalog activation paths, waits for Documentation, verifies the draft Release
assets and receipt, publishes the immutable Release, then squash-merges and
deletes the temporary branch. The active pointer therefore reaches `main` only
after the Release is downloadable and every validation has passed.

## Change checklist

- Preserve read-only permissions unless a documented job requires more.
- Add a timeout and deterministic cleanup to every long-running job.
- Use cache keys derived from committed inputs; never cache secrets.
- Pin Actions by SHA and let Dependabot update both SHA and version comment.
- Keep documentation builds mandatory for pull requests; deploy only trusted
  commits from `main`.
- Preserve the `github-pages` concurrency group so deployments remain ordered.
