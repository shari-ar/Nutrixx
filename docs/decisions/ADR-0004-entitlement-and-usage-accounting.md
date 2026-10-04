# ADR-0004: Versioned entitlements and reservation-based AI usage

| Field                      | Value                                      |
| -------------------------- | ------------------------------------------ |
| Status                     | Proposed                                   |
| Date                       | 2026-09-27                                 |
| Deciders                   | Product, Architecture, Billing, Operations |
| Owner                      | Nutrixx Product Platform                   |
| Related requirements       | FR-016, FR-018, FR-020; QR-016; QS-15      |
| Supersedes / superseded by | None                                       |

## Context and problem

Plans differ in data residency, hosted AI allowances, optimizer availability,
multi-device support, and assistant access. Hard-coded checks across clients
and services would drift. AI work incurs cost before the user confirms a draft,
while validation and technical failures release the user's allowance.

## Decision drivers

- One auditable definition of plan capabilities.
- Correct behavior under retries, concurrency, cancellation, and provider
  failure.
- Customer-friendly accounting without free duplicate executions.
- Safe plan changes and historical reconstruction.

## Considered options

1. Hard-code plan checks in each feature.
2. Decrement counters when a request is submitted.
3. Decrement counters only when a draft is saved.
4. Versioned entitlement catalog plus reserve/consume/release accounting.

## Decision

Adopt option 4. Product policy defines stable entitlement keys and values. A
versioned machine-readable catalog becomes the runtime authority and is
validated against the documented plan contract. Servers authorize premium and
cost-incurring work; clients use entitlement data for presentation only.

AI execution atomically reserves allowance after bounded validation. Technical
failure releases the reservation. Making a complete result available consumes
it, regardless of later user confirmation. Idempotent retries reuse the same
reservation and terminal result.

## Consequences

### Positive

- Plan copy, UI, API authorization, billing, tests, and support share semantics.
- Failed jobs release reserved allowance.
- Rejected successful results still account for incurred compute.
- Plan policy can evolve without scattering constants through code.

### Costs and trade-offs

- Reservation expiry and reconciliation require durable background work.
- Entitlement outages need explicit fail-closed/fail-open rules by capability.
- Timezone and billing-boundary handling require abuse-safe versioned policy.

## Validation and review triggers

Concurrency, retry, timeout, cancellation, provider-failure, timezone-change,
upgrade/downgrade, refund, and reconciliation fixtures must prove no double
consumption or unauthorized execution. Support adjustments are attributable,
reason-coded, reversible, and isolated from nutrition facts.
