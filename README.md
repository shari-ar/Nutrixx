# Nutrixx

Nutrixx is a personalized nutrition platform that turns simple food, activity, and optional health data into practical, confidence-aware meal recommendations across macros and micronutrients.

The [target technical documentation](docs/README.md) defines the intended
product, domain, architecture, scientific model, safety boundaries, quality
gates, operations, and delivery roadmap.

The published documentation site is available at
<https://shari-ar.github.io/Nutrixx/>.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/shari-ar/Nutrixx?quickstart=1)

## Repository map

| Path             | Responsibility                                                |
| ---------------- | ------------------------------------------------------------- |
| `apps/`          | Deployable API and Web applications                           |
| `packages/`      | Reusable contracts, configuration, and domain engines         |
| `infra/`         | Docker, Compose, and infrastructure-as-code definitions       |
| `docs/`          | Architecture, API, nutrition-model, and operational knowledge |
| `scripts/`       | Repository automation and policy checks                       |
| `.github/`       | CI, dependency automation, and repository governance          |
| `.devcontainer/` | Reproducible VS Code development environment                  |

## Environment setup

Use the Codespaces badge above for a hosted development environment, or open
the repository in its Dev Container locally. Both paths reuse the canonical
development Compose stack.

```powershell
Copy-Item .env.example .env
```

Both applications load their local runtime settings from this root `.env` file.
The real `.env` is ignored by Git; `.env.example` documents the required keys.

## Monorepo

Nutrixx uses npm workspaces and a committed lockfile. Restore every workspace
from the repository root:

```bash
npm ci
```

Common checks are available from the same location:

```bash
npm run contract:lint
npm run check
```

The design-first OpenAPI source of truth is
`packages/contracts/openapi/nutrixx.openapi.yaml`.

## Docker

Start the development stack with file watching:

```bash
npm run dev
```

Build and start the production-like stack in the background:

```bash
npm run docker:up
```

Validate Compose or build the verification target explicitly:

```bash
npm run docker:config
npm run docker:verify
```

Stop either stack:

```bash
npm run docker:down
```

The CI pipeline runs the same quality gate, builds both production images,
starts the production-like stack, and probes the API and Web endpoints. See
`docs/devops.md` for the operational contract and repository settings.

## Directory documentation policy

Every project-owned directory must contain a `README.md` that explains its
purpose, boundaries, contents, and operating conventions. Generated and
third-party directories such as `.git`, `node_modules`, `.next`, `dist`, and
`coverage` are excluded.

```bash
npm run docs:check
```

Update the nearest directory README whenever a structural or ownership change
makes its guidance inaccurate. CI enforces file presence; reviewers enforce
content accuracy.

## Documentation site

Start the documentation authoring server or validate the production site from
the repository root:

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

Navigation is generated from Markdown files under `docs/`, so new documents are
discovered automatically. Changes to documentation are built on pull requests
and deployed to GitHub Pages after they reach `main`.
