# ADR-0002: Local-first product with explicit cloud promotion

| Field                      | Value                                          |
| -------------------------- | ---------------------------------------------- |
| Status                     | Proposed                                       |
| Date                       | 2026-09-27                                     |
| Deciders                   | Product, Architecture, Security, Privacy, Data |
| Owner                      | Nutrixx Architecture                           |
| Related requirements       | FR-015–FR-021; QR-014–QR-016; QS-13–QS-16      |
| Supersedes / superseded by | None                                           |

## Context and problem

Nutrixx must provide a useful Free product without requiring users to place
nutrition content on Nutrixx servers. Paid plans add cloud persistence,
multi-device use, hosted AI, and higher-cost capabilities. Treating the server
as universally authoritative would violate the Free promise; treating browser
and server as concurrent masters would create unsafe divergence.

## Decision drivers

- Customer ownership, privacy, and low infrastructure cost for Free.
- A complete offline-capable local product before cloud expansion.
- Verifiable, reversible upgrade and downgrade without silent data loss.
- Identical scientific semantics in local and cloud execution.
- Honest degradation when browser or cloud storage is unavailable.

## Considered options

1. Server-first storage for every user.
2. Browser-only product for every plan.
3. Local-first Free with an explicit, verified single-authority cloud promotion.
4. Permanently dual-writable browser and cloud databases.

## Decision

Adopt option 3. Free nutrition content is canonically stored in the browser.
Pro and Ultimate use cloud canonical storage. A profile has one authority mode
and moves between modes through a verified migration state machine. Migration
staging remains isolated from writable production authority. Cloud clients
retain a bounded cache/outbox under explicit conflict semantics.

## Consequences

### Positive

- Free can deliver strong local privacy and operate without cloud availability.
- Paid cloud features are additive rather than required for core ownership.
- Authority, failure, deletion, and support responsibilities are explicit.
- Server cost follows paid cloud use.

### Costs and trade-offs

- Browser storage can be evicted and needs export, health, and migration UX.
- Two persistence adapters and cross-runtime conformance tests are required.
- Upgrade/downgrade is more complex than flipping an entitlement flag.
- Browser/device compatibility constrains the Local support matrix.

## Validation and review triggers

Release gates cover browser storage pressure, migration interruption at every
state, count/hash mismatch, schema evolution, insufficient downgrade space,
conflicts, multi-device convergence, deletion evidence, and deterministic
cross-adapter output. Reconsider only if a replacement preserves local privacy,
portability, single authority, and zero-loss transitions with stronger evidence.
