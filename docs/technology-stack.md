# Technology stack

| Field         | Value                                               |
| ------------- | --------------------------------------------------- |
| Status        | Current implementation inventory                    |
| Audience      | Engineering, architecture, security, and operations |
| Owner         | Nutrixx Engineering                                 |
| Last reviewed | 2026-09-30                                          |

This catalog lists only technologies that Nutrixx selects and invokes directly
in committed application code, configuration, automation, or documentation.
It excludes transitive dependencies, implementation details bundled inside a
listed technology, unused packages, and technologies that exist only in the
target architecture or roadmap.

Versions below are resolved versions from `package-lock.json` unless another
source is named. Package manifests remain the dependency-intent source of
truth; the lockfile remains the reproducible-installation source of truth.

## Application development

| Technology   | Current version             | Direct use                                      | Evidence                                         |
| ------------ | --------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| TypeScript   | API/Schema 6.0.3; Web 5.6.3 | Application language and static type checking   | API, Web, and Canonical Schema package manifests |
| NestJS       | 12.0.4                      | API application framework                       | `apps/api/package.json`                          |
| Next.js      | 16.3.5                      | Web application framework                       | `apps/web/package.json`                          |
| React        | 19.2.6                      | Web component runtime                           | `apps/web/package.json`                          |
| HeroUI       | 3.2.5                       | Web design system and component styling         | `apps/web/package.json`                          |
| Tailwind CSS | 4.1.11                      | Utility-first styling and CSS build integration | `apps/web/package.json`                          |
| PostCSS      | 8.5.28                      | CSS transformation pipeline                     | `apps/web/postcss.config.mjs`                    |
| next-themes  | 0.4.6                       | User-selectable light, dark, and system themes  | `apps/web/package.json`                          |
| clsx         | 2.1.1                       | Conditional component class composition         | `apps/web/package.json`                          |

## Contracts, build, and quality

| Technology      | Current version | Direct use                                       | Evidence                                          |
| --------------- | --------------- | ------------------------------------------------ | ------------------------------------------------- |
| OpenAPI         | 3.1.0           | Design-first HTTP contract                       | `packages/contracts/openapi/nutrixx.openapi.yaml` |
| JSON Schema     | Draft 2020-12   | Portable canonical-record schema                 | `packages/canonical-schema`                       |
| Zod             | 4.6.5           | Canonical and environment runtime validation     | Canonical Schema and Config package manifests     |
| Redocly CLI     | 2.53.3          | OpenAPI linting and contract bundling            | `package.json`                                    |
| Rspack          | 2.2.6           | Production API bundling                          | `apps/api/rspack.config.mjs`                      |
| Vitest          | 4.1.11          | Unit, integration, and end-to-end test execution | API, Web, and Canonical Schema package manifests  |
| Testing Library | 16.3.3          | User-centered React component assertions         | `apps/web/package.json`                           |
| Supertest       | 7.3.0           | In-process HTTP API assertions                   | `apps/api/package.json`                           |
| Oxlint          | 1.86.0          | API and Canonical Schema linting                 | API and Canonical Schema package manifests        |
| ESLint          | 9.39.5          | Web linting                                      | `apps/web/package.json`                           |
| Prettier        | 3.5.3           | Repository-wide deterministic formatting         | `package.json`                                    |
| Husky           | 9.1.7           | Git hook installation and pre-commit enforcement | `package.json`, `.husky/pre-commit`               |

## Runtime and delivery

| Technology     | Project version | Direct use                                          | Evidence                            |
| -------------- | --------------- | --------------------------------------------------- | ----------------------------------- |
| Node.js        | 24.21.0         | Application and tool runtime                        | `.node-version`                     |
| npm            | 11.19.0         | Dependency management and monorepo orchestration    | `package.json`, `package-lock.json` |
| Git            | Host managed    | Version control and change history                  | Repository metadata                 |
| Docker         | Host/CI managed | Reproducible builds and runtime images              | `infra/docker/Dockerfile`           |
| Docker Compose | Host/CI managed | Local development and production-like orchestration | `infra/compose/compose.yaml`        |
| Dev Containers | Host managed    | VS Code development environment                     | `.devcontainer/devcontainer.json`   |
| GitHub Actions | Hosted service  | CI and documentation deployment                     | `.github/workflows/`                |
| GitHub Pages   | Hosted service  | Technical documentation hosting                     | `.github/workflows/docs.yml`        |
| Dependabot     | Hosted service  | Controlled dependency update proposals              | `.github/dependabot.yml`            |

## Documentation

| Technology | Current version | Direct use                         | Evidence       |
| ---------- | --------------- | ---------------------------------- | -------------- |
| VitePress  | 1.6.4           | Documentation site generation      | `package.json` |
| Mermaid    | 11.17.2         | Architecture and workflow diagrams | `package.json` |

## Data stores

| Technology     | Current version | Direct use                                     | Evidence                            |
| -------------- | --------------- | ---------------------------------------------- | ----------------------------------- |
| IndexedDB      | Browser managed | Free local canonical-record authority          | `packages/persistence-indexeddb`    |
| PostgreSQL     | 18.6            | Cross-store contract probe; future cloud store | `packages/persistence-postgresql`   |
| node-postgres  | 8.23.0          | PostgreSQL adapter and transaction control     | PostgreSQL adapter package manifest |
| fake-indexeddb | 6.2.5           | IndexedDB contract-test implementation         | IndexedDB adapter package manifest  |

## Version verification

Before adding or upgrading a directly selected technology, verify the exact
stable release against its primary publisher, pin the intended version, update
the lockfile, and pass the repository quality gate. Pre-release tags do not
qualify. Framework internals, plugins, type declarations, and transitive
packages inherit the compatibility policy of their listed parent technology
and are not cataloged separately.

| Technology            | Verified stable | Primary evidence                                                                 |
| --------------------- | --------------- | -------------------------------------------------------------------------------- |
| PostgreSQL            | 18.6            | [PostgreSQL release notes](https://www.postgresql.org/docs/current/release.html) |
| node-postgres         | 8.23.0          | [npm package](https://www.npmjs.com/package/pg)                                  |
| fake-indexeddb        | 6.2.5           | [npm package](https://www.npmjs.com/package/fake-indexeddb)                      |
| React Testing Library | 16.3.3          | [npm package](https://www.npmjs.com/package/@testing-library/react)              |
| Supertest             | 7.3.0           | [npm package](https://www.npmjs.com/package/supertest)                           |
| PostCSS               | 8.5.28          | [npm package](https://www.npmjs.com/package/postcss)                             |
| next-themes           | 0.4.6           | [npm package](https://www.npmjs.com/package/next-themes)                         |
| clsx                  | 2.1.1           | [npm package](https://www.npmjs.com/package/clsx)                                |

## Maintenance rule

Add a technology only when Nutrixx deliberately owns the selection and the
repository directly uses it. Do not list a framework's internal packages or
transitive dependency graph. Update the version and evidence in the same pull
request that adopts, upgrades, replaces, or removes the technology.
