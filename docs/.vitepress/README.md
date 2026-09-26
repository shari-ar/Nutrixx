# Documentation site configuration

This directory contains the VitePress application that turns `docs/` into the
Nutrixx technical documentation site.

## Contents

- `config.mts` defines routing, metadata, search, navigation, and the generated
  sidebar. It also renders fenced `mermaid` blocks with the locked Mermaid
  runtime and a Nutrixx-specific theme.
- `theme/` contains the Nutrixx visual theme.
- `cache/` and `dist/` are generated locally and ignored by Git.

## Rules

- Keep documentation content outside this directory.
- Add normal Markdown files anywhere under `docs/`; the sidebar discovers them
  automatically.
- Treat broken internal links as build failures.
- Keep diagrams in fenced `mermaid` blocks; `npm run docs:check` validates every
  diagram before deployment.
- Keep deployment behavior in `.github/workflows/docs.yml`.
