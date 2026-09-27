# Data architecture

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Status        | Proposed target state                    |
| Audience      | Architecture, data, application, privacy |
| Owner         | Nutrixx Data                             |
| Last reviewed | 2026-09-27                               |

## Store roles

| Store                        | Durable authority                                                                                                 | Lifecycle                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Browser database            | Canonical user nutrition facts and local snapshots in `LOCAL`; bounded cache/outbox in `CLOUD`                    | Origin-scoped, schema-migrated, exportable; persistence/eviction risk is visible |
| PostgreSQL                   | Accounts, consent, entitlements/usage; user facts and snapshots only in `CLOUD`; policies, outbox, audit index    | Backed up, point-in-time recoverable, schema-migrated            |
| Object storage               | Raw licensed artifacts, quarantined imports, release manifests, evaluation artifacts, large audit exports         | Encrypted, versioned/immutable where required, retention-classed |
| Redis                        | Cache, rate limits, leases, and queue coordination                                                                | Disposable; reconstructed from durable sources                   |
| Analytics warehouse (future) | De-identified or purpose-approved analytical projections                                                          | Separate consent/purpose, no production read dependency          |

A user's profile is in exactly one authority mode. PostgreSQL remains the
authority for cloud identity, entitlements, usage accounting, and cloud-mode
facts. The browser database is authoritative for Free local nutrition content.
In cloud mode it is only a cache/outbox. No cache or search index is
authoritative.

| Concern | `LOCAL` authority | `CLOUD` authority |
| --- | --- | --- |
| Meals, recipes, profile, preferences | Browser database | PostgreSQL |
| Derived nutrition state and local plan | Browser database, reproducible from local facts | PostgreSQL/object artifact as defined by output class |
| Account, subscription, entitlement, hosted usage | Not required for ordinary local use | PostgreSQL |
| Reference food/science release | Signed immutable release cached locally | Signed immutable release with cloud index/cache |
| Export/import manifest | User-controlled portable artifact | User-controlled artifact generated from canonical cloud snapshot |

## Data categories

| Category            | Examples                                             | Mutation model                            |
| ------------------- | ---------------------------------------------------- | ----------------------------------------- |
| User-entered facts  | Meals, preferences, observations                     | Append/correct with audit history         |
| Reference knowledge | Nutrients, foods, portions, target policies          | Immutable published versions              |
| Derived snapshots   | Recipe nutrition, daily state, health context, plans | Immutable output plus fingerprint         |
| Operational state   | Job status, idempotency, delivery attempts           | Mutable but auditable where consequential |
| Evidence artifacts  | Source files, mapping reports, evaluation results    | Content-addressed/immutable               |
| Entitlement state   | Grants, reservations, consumption, adjustments       | Append/transition with attributable audit |
| Migration state     | Manifest, chunks, verification, authority decision   | Resumable state machine; immutable evidence |

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
- Local schema migrations are transactional where supported, version-gated,
  fixture-tested against historical databases, and retain a recoverable export
  or prior store until validation succeeds.
- Free local nutrition content is never uploaded by ordinary telemetry,
  authentication, entitlement checks, or static/reference delivery.
- Authority promotion/demotion follows the verified protocol in
  [Storage-mode lifecycle](../domain/storage-mode-lifecycle.md).

## Consistency

Aggregate writes and event envelopes commit in one authority-local transaction.
Cloud mode uses the PostgreSQL outbox; local mode uses a durable browser event
log.
Cross-context state is eventually consistent and exposes its watermark/version
where staleness matters. Commands are idempotent; derived snapshots are keyed
by input fingerprint to prevent accidental duplication.
