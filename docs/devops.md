# DevOps baseline

| Field         | Value                                 |
| ------------- | ------------------------------------- |
| Status        | Current repository baseline           |
| Audience      | Contributors and platform engineering |
| Owner         | Nutrixx Engineering                   |
| Last reviewed | 2026-10-30                            |

This document describes the repository as it operates today. The
[target operating model](operations/target-operating-model.md) describes the
production capabilities required before launch.

The concise inventory of directly selected technologies is maintained in the
[technology stack](technology-stack.md). Transitive dependencies and framework
internals are intentionally excluded from that catalog.

## Operating contract

| Concern               | Source of truth                                      |
| --------------------- | ---------------------------------------------------- |
| Node.js               | `.node-version`, `package.json`, Docker base image   |
| Dependencies          | Root `package-lock.json`; restore with `npm ci`      |
| Local stack           | `infra/compose/compose.yaml` plus `compose.dev.yaml` |
| Production-like stack | `infra/compose/compose.yaml`                         |
| Image definition      | `infra/docker/Dockerfile`                            |
| Quality gate          | `npm run check`                                      |
| Security gate         | `npm run security:vulnerabilities`                   |
| Automation            | `.github/workflows/ci.yml` and `docs.yml`            |

`npm install` changes dependency intent and the lockfile. `npm ci` restores the
committed dependency graph and is required in CI, containers, and clean setup.

## CI gates

1. `security` scans the complete Git history with Gitleaks, applies only exact
   documented false-positive fingerprints from `.gitleaksignore`, and audits the locked
   dependency graph. Runtime dependencies block at high severity; the complete
   graph blocks at critical severity.
2. `quality` restores the lockfile, verifies the toolchain and documentation
   policy, detects dead code with Knip, enforces a 0.7% jscpd duplication ceiling,
   and runs formatting, linting, tests, contract bundling, type checks, and
   production builds.
3. `containers` validates the Compose model, builds the API and Web runtime
   images with BuildKit cache, starts them, waits for health, and probes their
   public endpoints.
4. `persistence-contract` runs the shared repository contract against
   PostgreSQL after the security and quality gates succeed.

Third-party actions are pinned to immutable commit SHAs. Dependabot maintains
npm packages, action SHAs, and the pinned Docker base-image digest quarterly.

## Documentation delivery

VitePress turns the Markdown source in `docs/` into a versioned static site.
`npm run docs:build` fails on invalid configuration and broken internal links;
local full-text search, sitemap generation, clean URLs, and generated navigation
are included in the output.

Pull requests that touch documentation or its toolchain build the complete site
without publishing it. A successful build on `main` is uploaded as a GitHub
Pages artifact and deployed through the protected `github-pages` environment.
Deployment permissions are isolated to that job and all actions are pinned to
immutable commits.

| Command                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `npm run docs:dev`     | Start the local authoring server             |
| `npm run docs:build`   | Produce and validate the deployable site     |
| `npm run docs:preview` | Preview the production build locally         |
| `npm run docs:check`   | Enforce the directory-documentation contract |

Repository settings must use **GitHub Actions** as the Pages source. The
published site is `https://shari-ar.github.io/Nutrixx/` unless a custom domain
is introduced by an explicit architecture decision.

## Required GitHub settings

Protect `main` and require a pull request, one approval, conversation
resolution, and both CI checks. Block force pushes and branch deletion. Enable
Dependabot alerts, secret scanning, and push protection when available.

## Deferred until an application deployment target exists

Registry publishing, environment approvals, deployment workflows, release
promotion, runtime secrets, backups, observability, and rollback automation must
be designed against the selected application hosting platform rather than
guessed now. The documentation site is already deployed independently through
GitHub Pages.

## Design references

- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Docker build-cache optimization](https://docs.docker.com/build/cache/optimize/)
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [VitePress deployment](https://vitepress.dev/guide/deploy)
- [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
