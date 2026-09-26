# API end-to-end tests

Black-box tests that verify the assembled NestJS application through its public
HTTP boundary.

## Conventions

- Name files `*.e2e-spec.ts` and run them with `vitest.config.e2e.ts`.
- Assert observable behavior rather than private implementation details.
- Isolate mutable state per test and make teardown unconditional.
- Use deterministic fixtures; never depend on production services or data.
- Cover contract compatibility, authentication boundaries, and failure paths.

```bash
npm run test:e2e --workspace=@nutrixx/api
```
