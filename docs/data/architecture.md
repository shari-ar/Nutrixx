# Data architecture

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Status        | Proposed target state                    |
| Audience      | Architecture, data, application, privacy |
| Owner         | Nutrixx Data                             |
| Last reviewed | 2026-10-03                               |

## Store roles

| Store                        | Durable authority                                                                                              | Lifecycle                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Browser database             | Canonical user nutrition facts and local snapshots in `LOCAL`; bounded cache/outbox in `CLOUD`                 | Origin-scoped, schema-migrated, exportable; persistence/eviction risk is visible |
| PostgreSQL                   | Accounts, consent, entitlements/usage; user facts and snapshots only in `CLOUD`; policies, outbox, audit index | Backed up, point-in-time recoverable, schema-migrated                            |
| Object storage               | Raw licensed artifacts, quarantined imports, release manifests, evaluation artifacts, large audit exports      | Encrypted, versioned/immutable where required, retention-classed                 |
| Redis                        | Cache, rate limits, leases, and queue coordination                                                             | Disposable; reconstructed from durable sources                                   |
| Analytics warehouse (future) | De-identified or purpose-approved analytical projections                                                       | Separate consent/purpose, no production read dependency                          |

A user's profile is in exactly one authority mode. PostgreSQL remains the
authority for cloud identity, entitlements, usage accounting, and cloud-mode
facts. The browser database is authoritative for Free local nutrition content.
In cloud mode it is only a cache/outbox. No cache or search index is
authoritative.

| Concern                                          | `LOCAL` authority                               | `CLOUD` authority                                                |
| ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------- |
| Meals, recipes, profile, preferences             | Browser database                                | PostgreSQL                                                       |
| Derived nutrition state and local plan           | Browser database, reproducible from local facts | PostgreSQL/object artifact as defined by output class            |
| Account, subscription, entitlement, hosted usage | Not required for ordinary local use             | PostgreSQL                                                       |
| Reference food/science release                   | Signed immutable release cached locally         | Signed immutable release with cloud index/cache                  |
| Export/import manifest                           | User-controlled portable artifact               | User-controlled artifact generated from canonical cloud snapshot |

## Data categories

| Category            | Examples                                             | Mutation model                              |
| ------------------- | ---------------------------------------------------- | ------------------------------------------- |
| User-entered facts  | Meals, preferences, observations                     | Append/correct with audit history           |
| Reference knowledge | Nutrients, foods, portions, target policies          | Immutable published versions                |
| Derived snapshots   | Recipe nutrition, daily state, health context, plans | Immutable output plus fingerprint           |
| Operational state   | Job status, idempotency, delivery attempts           | Mutable but auditable where consequential   |
| Evidence artifacts  | Source files, mapping reports, evaluation results    | Content-addressed/immutable                 |
| Entitlement state   | Grants, reservations, consumption, adjustments       | Append/transition with attributable audit   |
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
- Browser support, operational headroom, persistence UX, and export reminders
  follow [ADR-0006](../decisions/ADR-0006-browser-support-and-local-storage-resilience.md).

## Consistency

Aggregate writes and event envelopes commit in one authority-local transaction.
Cloud mode uses the PostgreSQL outbox; local mode uses a durable browser event
log.
Cross-context state is eventually consistent and exposes its watermark/version
where staleness matters. Commands are idempotent; derived snapshots are keyed
by input fingerprint to prevent accidental duplication.

### Local atomic command protocol

The version `1` IndexedDB adapter commits canonical record mutations, one
monotonic transaction-log entry, and one command receipt in the same strict
read-write transaction. A repeated `commandId` with identical canonical command
content returns the original receipt without another write; divergent reuse
fails. If validation, a record mutation, log append, or receipt write fails, the
whole transaction aborts. Log entries retain the resulting record snapshots or
deletion tombstones so later projections and recovery checks can replay accepted
local changes in sequence order.

### Pre-release browser schema lifecycle

The IndexedDB schema runner currently recognizes only a fresh database to
baseline version `1`. It atomically installs canonical records, transaction log,
command receipts, and schema metadata. Reopening version `1` is a no-op; any
other transition fails closed. Until the first public release, development may
replace this baseline rather than accumulate disposable migrations. After a
release can contain user data, new immutable upgrade steps and historical
fixtures are required before the database version can advance.

### Verified local export and import

Local export format version `1` contains canonical records, the complete local
transaction log, and a strict manifest. The manifest declares export,
canonical-schema, and database-schema versions; UTC creation time; record and
transaction counts; last sequence; subject identifiers; and the canonical
payload SHA-256 digest. Reference releases are excluded because they are
disposable and can be fetched again.

Before import, Nutrixx rejects unknown structure or versions, malformed or
duplicate identities, invalid record seals, count or hash mismatches,
non-monotonic log order, incorrect mutation outcomes, and any final state that
cannot be reproduced by replaying the log. Only a fully validated artifact may
replace local authority data. Records, log entries, and reconstructed command
receipts replace the prior state in one strict IndexedDB transaction; any
interruption restores the complete prior state.

SHA-256 detects accidental corruption and inconsistent artifacts. It does not
claim publisher authenticity or make a user export secret; transport,
encryption, and trusted-reference-release signing are separate controls.

### Reference dataset cache isolation

Reference datasets live in a dedicated IndexedDB database, never in the user
authority database or its exports. Each immutable release has a unique release
identifier, publication time, size, manifest digest, and payload digest. A
conflicting reuse of a release identifier fails closed. The active release is
pinned while inactive releases may be pruned in deterministic least-recently-
used order. Clearing the cache resets its active pointer and removes only
re-downloadable reference content; it cannot clear canonical user records.

### Local storage control surface

The Settings storage page reads the browser estimate and persistence state at
runtime. It displays Local authority and browser-profile scope, approximate
usage and quota, pressure state, schema versions, active reference release, and
the last verified export handoff. Unknown or unavailable browser capabilities
remain explicit instead of being inferred from user-agent strings.

The application calls `persist()` only from the user-initiated **Protect data**
action and explains that persistence reduces eviction risk without becoming a
backup. Export generates and validates format version `1` before handing a JSON
artifact to the browser. Clear Data requires a destructive preview, offers an
export first, then removes the disposable reference database before deleting
the user-authority database and local export metadata. A blocked deletion fails
visibly rather than reporting success while another tab retains the database.

### Stage 1 browser resilience evidence

Executable fixtures verify that accepted facts and their log survive repository
close/reopen, and that local read/export operations require no network request.
Quota exhaustion is injected before log append and must roll back both record
and log. An interrupted version-change transaction must leave no partial schema
and allow a clean baseline installation. A committed format-version `1` export
fixture must remain importable, while malformed, tampered, or unsupported
artifacts fail before replacement. Explicit database deletion must recreate an
empty, valid baseline on the next open.

## Adapter conformance

IndexedDB and PostgreSQL implement one storage-neutral canonical-record port
and must pass the same executable contract suite. The suite fixes observable
semantics for validation, cloning, deterministic subject queries, idempotence,
version conflicts, stable identity, deletion, and concurrent writes. The
PostgreSQL adapter remains a Stage 1 conformance probe; passing the suite does
not promote local data to cloud authority or enable hosted product behavior.
