# Shared packages

Reusable, independently testable building blocks consumed by applications.

## Workspaces

| Path                      | Responsibility                                            |
| ------------------------- | --------------------------------------------------------- |
| `canonical-schema/`       | Storage-neutral canonical records and serialization       |
| `config/`                 | Shared tool and runtime configuration contracts           |
| `contracts/`              | Public machine-readable API contracts                     |
| `nutrition-engine/`       | Deterministic nutrition-domain calculations               |
| `optimizer-engine/`       | Constraint-based recommendation optimization              |
| `persistence/`            | Storage-neutral repository contract and conformance suite |
| `persistence-indexeddb/`  | Browser IndexedDB canonical-record adapter                |
| `persistence-postgresql/` | PostgreSQL canonical-record conformance adapter           |

## Dependency rules

- Packages may depend on lower-level packages but never on `apps/*`.
- Public exports must be explicit, documented, typed, and tested.
- Avoid framework coupling in domain packages.
- Add a package only when it has a clear owner and reuse boundary.
