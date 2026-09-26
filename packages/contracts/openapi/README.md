# OpenAPI source

Design-first, reviewable source contract for Nutrixx HTTP APIs.

## Source of truth

`nutrixx.openapi.yaml` defines the current public API version. Generated bundles,
clients, server types, and documentation are downstream artifacts.

## Change rules

- Design and lint the contract before implementation.
- Reuse named component schemas and stable operation IDs.
- Document validation constraints, error responses, security, and examples.
- Treat removals and incompatible semantic changes as breaking changes.
- Never include real personal, nutrition, laboratory, or authentication data.

```bash
npm run contract:lint
npm run contract:build
```
