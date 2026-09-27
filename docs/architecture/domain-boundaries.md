# Domain boundaries and dependency rules

| Field         | Value                          |
| ------------- | ------------------------------ |
| Status        | Proposed                       |
| Audience      | Application and data engineers |
| Owner         | Nutrixx Architecture           |
| Last reviewed | 2026-09-27                     |

## Logical modules

| Module            | Owns writes to                                      | May consume                                          |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------- |
| identity-consent  | accounts, grants, sessions, privacy requests        | identity provider claims                             |
| user-context      | profile, goals, preferences, observations           | identity reference, consent decisions                |
| food-knowledge    | foods, portions, composition, classifications       | published dataset releases                           |
| recipe-knowledge  | recipes, immutable versions, yield, method          | public food references                               |
| consumption       | meals, items, corrections                           | food/recipe snapshots, user locale/timezone          |
| nutrition-science | nutrient ontology, target and rule-set releases     | approved scientific evidence                         |
| nutrition-state   | immutable state snapshots                           | consumption events, user context, rule/data releases |
| planning          | requests, optimizer runs, plans, feedback           | state/user/food snapshots, active rule release       |
| data-publication  | source batches, mappings, quality reports, releases | external source artifacts                            |
| audit-provenance  | append-only evidence and decision traces            | domain events and run fingerprints                   |
| commerce-entitlements | subscriptions, entitlement grants, usage reservations and ledger | billing-provider events, identity reference          |
| portability-sync  | export bundles, migration sessions, sync cursors and conflicts | canonical snapshots, identity and entitlement decisions |
| ai-orchestration  | capture jobs, validated drafts, assistant sessions and tool invocations | entitlements, read-only domain projections, allowlisted application tools |

## Enforced dependency direction

```text
interfaces/contracts
        ↑
domain (framework-free)
        ↑
application use cases
        ↑
adapters: HTTP, persistence, queue, external providers
        ↑
composition root
```

Rules:

- Domain packages MUST NOT import NestJS, database clients, HTTP clients, queue
  SDKs, or environment variables.
- A module MUST NOT access another module's repository or write-owned tables.
- Cross-module synchronous calls use a documented application interface.
- Cross-module asynchronous communication uses a versioned event envelope.
- Shared code is limited to stable primitives such as identifiers, units,
  time, result types, and contract tooling—not a miscellaneous utilities dump.
- Circular dependencies fail CI architecture tests.
- Read models may join replicated/public data, but they do not create hidden
  write coupling.
- Browser and PostgreSQL adapters implement the same canonical repository
  contracts; adapter choice does not leak into domain rules.
- Entitlements authorize capabilities but never alter nutrition facts or
  scientific calculations.
- AI orchestration can propose typed commands; the owning domain validates and
  commits a confirmed command through its public application interface.
- Migration/sync is the only module allowed to switch canonical authority, and
  it does so only after manifest and content verification.

## Transaction boundaries

One use case updates one owning aggregate and its outbox record atomically.
Cross-context workflows use sagas/process managers with explicit compensation
or replay. A distributed transaction is not assumed.

## Extraction criteria

A module becomes a separate service only if at least one measured condition is
material and cannot be solved safely inside the monolith:

1. materially different scaling or compute profile;
2. required blast-radius or security isolation;
3. independent deployment cadence owned by a stable team;
4. incompatible runtime or data technology with demonstrated value;
5. availability objective that the shared process cannot meet.

The extraction plan MUST include contract ownership, data migration, failure
semantics, observability, operating cost, and rollback.
