# GitHub Actions workflows

Required continuous-integration definitions for pull requests, merge queues,
manual verification, and pushes to `main`.

## Current workflows

`ci.yml` provides two ordered gates:

1. `Quality gate` restores the lockfile and runs documentation, formatting,
   lint, tests, contract bundling, type checks, and production builds.
2. `Container smoke test` builds both runtime images, waits for health, probes
   API/Web endpoints, prints failure diagnostics, and always cleans up.

`docs.yml` builds the VitePress site for documentation pull requests and
deploys it to the protected `github-pages` environment after documentation
changes reach `main`. The build uses full Git history for accurate page-update
timestamps, uploads only the generated site, and grants deployment permissions
only to the deployment job.

## Change checklist

- Preserve read-only permissions unless a documented job requires more.
- Add a timeout and deterministic cleanup to every long-running job.
- Use cache keys derived from committed inputs; never cache secrets.
- Pin Actions by SHA and let Dependabot update both SHA and version comment.
- Keep documentation builds mandatory for pull requests; deploy only trusted
  commits from `main`.
- Preserve the `github-pages` concurrency group so deployments remain ordered.
