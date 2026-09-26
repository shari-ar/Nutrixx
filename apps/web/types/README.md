# Web-local types

TypeScript declarations used only by the Web application and not owned by a
specific route or component.

## Rules

- Derive API types from the contract-generation pipeline when introduced.
- Keep shared domain types in an appropriate package, not duplicated here.
- Prefer narrow types and discriminated unions over broad optional objects.
- Do not use this directory as a catch-all for framework declarations.
