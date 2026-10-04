# Domain boundaries and dependency rules

| Field         | Value                          |
| ------------- | ------------------------------ |
| Status        | Proposed                       |
| Audience      | Application and data engineers |
| Owner         | Nutrixx Architecture           |
| Last reviewed | 2026-09-27                     |

## Logical modules

| Module                | Owns writes to                                                          | May consume                                                               |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| identity-consent      | accounts, grants, sessions, privacy requests                            | identity provider claims                                                  |
| user-context          | profile, goals, preferences, observations                               | identity reference, consent decisions                                     |
| food-knowledge        | foods, portions, composition, classifications                           | published dataset releases                                                |
| recipe-knowledge      | recipes, immutable versions, yield, method                              | public food references                                                    |
| consumption           | meals, items, corrections                                               | food/recipe snapshots, user locale/timezone                               |
| nutrition-science     | nutrient ontology, target and rule-set releases                         | approved scientific evidence                                              |
| nutrition-state       | immutable state snapshots                                               | consumption events, user context, rule/data releases                      |
| planning              | requests, optimizer runs, plans, feedback                               | state/user/food snapshots, active rule release                            |
| data-publication      | source batches, mappings, quality reports, releases                     | external source artifacts                                                 |
| audit-provenance      | append-only evidence and decision traces                                | domain events and run fingerprints                                        |
| commerce-entitlements | subscriptions, entitlement grants, usage reservations and ledger        | billing-provider events, identity reference                               |
| portability-sync      | export bundles, migration sessions, sync cursors and conflicts          | canonical snapshots, identity and entitlement decisions                   |
| ai-orchestration      | capture jobs, validated drafts, assistant sessions and tool invocations | entitlements, read-only domain projections, allowlisted application tools |

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

- Domain packages import domain-safe shared contracts and standard-library types.
- Each module accesses state through its own repositories or another module's
  published application interface.
- Cross-module synchronous calls use a documented application interface.
- Cross-module asynchronous communication uses a versioned event envelope.
- Shared code is a focused collection of stable primitives such as identifiers,
  units, time, result types, and contract tooling.
- Circular dependencies fail CI architecture tests.
- Read models may join replicated/public data while preserving owner-controlled
  write boundaries.
- Browser and PostgreSQL adapters implement the same canonical repository
  contracts; adapter choice remains inside the adapter layer.
- Entitlements authorize capability access while nutrition facts and scientific
  calculations retain stable meaning.
- AI orchestration can propose typed commands; the owning domain validates and
  commits a confirmed command through its public application interface.
- Migration/sync is the only module allowed to switch canonical authority, and
  it does so only after manifest and content verification.

## Transaction boundaries

One use case updates one owning aggregate and its outbox record atomically.
Cross-context workflows use sagas/process managers with explicit compensation
or replay. Each module commits locally, and sagas coordinate cross-context work.

## Extraction criteria

A module qualifies for separate-service extraction when at least one measured
condition is material and demonstrates value beyond safe monolith evolution:

1. materially different scaling or compute profile;
2. required blast-radius or security isolation;
3. independent deployment cadence owned by a stable team;
4. incompatible runtime or data technology with demonstrated value;
5. availability objective requiring an independently operated process.

The extraction plan MUST include contract ownership, data migration, failure
semantics, observability, operating cost, and rollback.
