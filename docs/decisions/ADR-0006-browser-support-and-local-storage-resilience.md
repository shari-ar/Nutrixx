# ADR-0006: Supported browsers and resilient local storage

| Field                      | Value                                                |
| -------------------------- | ---------------------------------------------------- |
| Status                     | Accepted                                             |
| Date                       | 2026-09-29                                           |
| Deciders                   | Product, Web Engineering, Quality, Security          |
| Owner                      | Nutrixx Web Engineering                              |
| Related requirements       | FR-015, FR-021; QR-005, QR-014, QR-015; QS-13, QS-14 |
| Resolves                   | OD-016                                               |
| Supersedes / superseded by | None                                                 |

## Context and problem

In Free mode, one browser profile is the canonical authority for a person's
nutrition data. Browser storage is origin-scoped, quota-limited, and initially
best-effort. Quota values vary by browser and device, estimates are deliberately
imprecise, persistence requests may be denied, and private or embedded browsing
contexts may delete or partition data unexpectedly.

Nutrixx therefore needs an explicit support boundary, storage budget, persistence
experience, operational headroom rule, and export-reminder policy before local
data can be treated as a product foundation.

## Decision drivers

- Preserve the complete Free product without silent cloud upload.
- Prevent browser or storage differences from changing canonical data meaning.
- Degrade honestly when persistence or capacity is unavailable.
- Avoid fixed quota assumptions that become incorrect across devices.
- Protect user facts before disposable reference data or caches.
- Keep browser support measurable and maintainable.

## Considered options

1. Support any browser that can render the application.
2. Support Chromium only and use vendor-specific storage behavior.
3. Support a tested cross-browser matrix with capability gates and dynamic
   storage management.
4. Require cloud storage for every user.

## Decision

Adopt option 3.

### Supported execution boundary

Local authority is supported only in a top-level, secure (`HTTPS`) browsing
context using a normal, persistent browser profile.

| Class                            | Supported release policy                                                                         | Stage 1 evidence                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Chrome desktop and Android       | Current and immediately previous Stable major                                                    | Automated conformance plus representative physical-device checks     |
| Edge desktop                     | Current and immediately previous Stable major                                                    | Automated conformance on Windows                                     |
| Firefox desktop and Android      | Current and immediately previous Stable major                                                    | Automated conformance plus representative physical-device checks     |
| Safari on macOS, iOS, and iPadOS | Current and immediately previous major OS/Safari release still receiving vendor security support | Real Safari/device checks; an emulation engine alone is insufficient |

The exact tested versions and operating systems are recorded in each release's
evidence bundle rather than frozen in this ADR. A newly released browser enters
the matrix after smoke and storage-conformance checks; the oldest release leaves
when the policy window advances.

Private/Incognito/InPrivate sessions, embedded or third-party frames, in-app
browsers, unmanaged WebViews, opaque origins, and browsers outside vendor
security support receive an explanatory or recovery experience. Local authority
requires the supported execution boundary described above, and durability
claims appear exclusively in supported contexts.

Core production features SHOULD use **Baseline Widely Available** web-platform
capabilities. A newer or limited-availability capability requires feature
detection, an equivalent supported fallback, or an explicit capability gate.
Runtime probes and behavioral conformance tests authorize local-storage
capability; user-agent strings serve informational purposes only.

### Canonical storage and isolation

- IndexedDB is the Stage 1 canonical browser database because it provides
  asynchronous, transactional storage for structured data.
- IndexedDB holds canonical nutrition, health, migration, and recovery data;
  `localStorage` and `sessionStorage` hold presentation preferences only.
- Cache Storage and OPFS MAY hold replaceable assets or future optimized
  projections, but they are non-authoritative until a separate decision changes
  that boundary.
- Canonical user records, reference releases, application caches, migration
  staging, and export staging have separate logical accounting even when the
  browser reports one origin-level quota.
- Storage reclamation targets disposable caches and inactive reference releases
  while user records remain protected.

### Capacity and operational headroom

Nutrixx MUST use `navigator.storage.estimate()` where available and treat both
`usage` and `quota` as approximate. Capacity messaging refers to browser-reported
origin quota because browsers expose that value rather than reliable physical
device-free-space.

Before a write that can materially expand storage, the caller calculates:

```text
required headroom
= estimated bytes for the operation and its staging copy
+ max(64 MiB, current canonical user-data bytes)
```

The second term preserves rollback/export working space. Unknown sizes use a
conservative upper estimate. Every write still handles `QuotaExceededError`
because every estimate remains approximate.

| State    | Trigger                                                                      | Required behavior                                                                          |
| -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Healthy  | Usage below 70% of reported quota and required headroom available            | Normal operation                                                                           |
| Warning  | Usage at least 70%, or less than twice the next known operation size remains | Show a non-blocking storage warning and prioritize export                                  |
| Critical | Usage at least 85%, or required headroom is unavailable                      | Block optional growth; preserve read, correction, export, and cleanup paths                |
| Unknown  | Estimate is absent, invalid, or denied                                       | Permit bounded writes with exception handling; label capacity unknown and recommend export |

An operation requiring more headroom completes atomically or preserves accepted
canonical facts unchanged. The UI reports a safe error, offers export and
disposable-data cleanup, and reports saved status exclusively after commit.

### Persistence experience

Nutrixx checks `navigator.storage.persisted()` without prompting. After the
first successful canonical write, it explains that browser-local data can be
lost and offers a user-initiated **Protect data on this device** action. Only
that action calls `navigator.storage.persist()`. Calls require this explicit
action, a clear outcome explanation, and a fresh user request after refusal.

Settings always display:

- authority mode and browser profile scope;
- persistent, best-effort, unavailable, or unknown retention status;
- approximate usage/quota and current pressure state;
- canonical schema and reference-release versions;
- date of the last successfully generated and internally verified export;
- actions to request persistence, export, import, remove disposable data, and
  clear all local data.

A granted persistence request reduces browser-initiated eviction risk. Product
copy describes its exact browser-defined scope, while verified export provides
the portable recovery path. Manual local use remains available after refusal.

### Export reminder policy

Export reminders are local, non-blocking, and contain no nutrition payload in
telemetry.

1. After canonical user data exists, remind when seven days have passed without
   a successfully generated and internally verified export.
2. After the first export, remind every 30 days only when canonical data has
   changed since that export.
3. Allow a seven-day snooze and show at most one routine reminder in each
   seven-day period.
4. Escalate the reminder when storage becomes Warning/Critical, persistence is
   unavailable, pending user grant, or a destructive clear/reset is requested.
5. A destructive clear requires an explicit preview and confirmation; export is
   offered immediately beforehand, and completion status follows verified
   artifact generation.

“Verified export” means Nutrixx serialized the declared snapshot, validated its
manifest, counts, relationships, and hashes, then handed the artifact to the
browser. The UI explains that continued possession of the downloaded file
remains the user's responsibility.

### Migration policy before first public release

Stage 1 establishes schema version `1`, a migration runner, atomic upgrade
semantics, and historical-fixture capability. Before the first public release,
development may replace schema `1` rather than accumulate disposable production
migrations. Once a released schema can contain user data, every supported
schema transition is immutable, fixture-tested, recoverable, and retained for
the published compatibility window.

## Consequences

### Positive

- Browser support and storage promises are explicit and testable.
- Capacity adapts to the actual origin instead of relying on vendor folklore.
- Persistence is requested at a comprehensible moment with precise scope.
- Local data loss risk is reduced through verified export and visible status.
- Cross-browser fallbacks remain possible without changing the canonical model.

### Costs and trade-offs

- Real Safari and mobile-device testing is required in addition to desktop
  automation.
- Two recent release generations increase conformance cost.
- A browser may deny persistence or revise quota after a successful estimate.
- Export reminders reduce risk while long-term backup possession remains the
  user's responsibility.

## Validation and review triggers

Stage 1 exits after the supported matrix passes repository, transaction,
reload, offline, persistence-denial, storage-pressure, `QuotaExceededError`,
interrupted-migration, export/import, clear-data, and recovery fixtures.

Review this ADR when a supported browser changes storage or eviction behavior,
Baseline changes the core browser set, the reference release materially changes
size, failure data shows the thresholds are ineffective, or Nutrixx introduces
another canonical browser store.

## References

- [WHATWG Storage Standard](https://storage.spec.whatwg.org/)
- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN: Baseline compatibility](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)
- [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [web.dev: Persistent storage](https://web.dev/articles/persistent-storage)
