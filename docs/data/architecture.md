# Data architecture

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Status        | Proposed target state                    |
| Audience      | Architecture, data, application, privacy |
| Owner         | Nutrixx Data                             |
| Last reviewed | 2026-09-22                               |

## Store roles

| Store                        | Durable authority                                                                                                 | Lifecycle                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PostgreSQL                   | Accounts, consent, user facts, food/recipe canonical records, policies, state/plan snapshots, outbox, audit index | Backed up, point-in-time recoverable, schema-migrated            |
| Object storage               | Raw licensed artifacts, quarantined imports, release manifests, evaluation artifacts, large audit exports         | Encrypted, versioned/immutable where required, retention-classed |
| Redis                        | Cache, rate limits, leases, and queue coordination                                                                | Disposable; reconstructed from durable sources                   |
| Analytics warehouse (future) | De-identified or purpose-approved analytical projections                                                          | Separate consent/purpose, no production read dependency          |

PostgreSQL remains the source of truth for operational identity and references.
No cache or search index is authoritative.

## Data categories

| Category            | Examples                                             | Mutation model                            |
| ------------------- | ---------------------------------------------------- | ----------------------------------------- |
| User-entered facts  | Meals, preferences, observations                     | Append/correct with audit history         |
| Reference knowledge | Nutrients, foods, portions, target policies          | Immutable published versions              |
| Derived snapshots   | Recipe nutrition, daily state, health context, plans | Immutable output plus fingerprint         |
| Operational state   | Job status, idempotency, delivery attempts           | Mutable but auditable where consequential |
| Evidence artifacts  | Source files, mapping reports, evaluation results    | Content-addressed/immutable               |

## Temporal model

Important records distinguish:

- valid time: when a fact or policy applies in the real world;
- system time: when Nutrixx learned or changed the record;
- recorded time: when an event was submitted;
- local date/time and IANA timezone: how the user experienced a meal/day;
- calculation time: when an immutable snapshot was produced.

Corrections do not erase the previous statement. They create a new assertion
and identify what it corrects. Target/rule activation is effective-dated.

## Version model

| Layer             | Required version                                        |
| ----------------- | ------------------------------------------------------- |
| External data     | Provider, release/revision, source record, license      |
| Canonical dataset | Immutable Nutrixx release ID and manifest hash          |
| Recipe            | Recipe version plus calculation release                 |
| Scientific policy | Rule-set/target-policy release and applicability        |
| User context      | Profile, goals, consent, and observation watermark      |
| Engine            | Package/build and algorithm/model version               |
| Optimization      | Solver/version/configuration, deterministic seed/budget |
| Output            | Input fingerprint, output hash, generation time         |

## Persistence rules

- Public identifiers are opaque and non-sequential.
- Scientific quantities use exact decimal/numeric representations, never binary
  floating point as durable truth.
- Units and bases are identifiers, not free-text suffixes.
- UTC instants are stored for ordering; local date/time and IANA timezone are
  stored when day semantics matter.
- Deletion, anonymization, and retention are policy-driven workflows; database
  cascades are not the privacy model.
- Tables/collections have one owning bounded context. Cross-context read models
  are projections, not shared write ownership.
- Data migrations use expand/migrate/contract and remain compatible during
  rolling deployment.

## Consistency

Aggregate writes and outbox messages commit in one database transaction.
Cross-context state is eventually consistent and exposes its watermark/version
where staleness matters. Commands are idempotent; derived snapshots are keyed
by input fingerprint to prevent accidental duplication.
