# HTTP API conventions

| Field           | Value                                             |
| --------------- | ------------------------------------------------- |
| Status          | Proposed target contract policy                   |
| Audience        | API producers and consumers                       |
| Owner           | Nutrixx API Engineering                           |
| Last reviewed   | 2026-09-27                                        |
| Source of truth | `packages/contracts/openapi/nutrixx.openapi.yaml` |

## Contract first

OpenAPI changes precede implementation. Every operation has a stable
`operationId`, explicit security, request/response schemas, error responses,
examples, and bounded payloads. CI lints and bundles the contract, generates or
checks types, runs provider/consumer contract tests, and blocks breaking changes
unless a versioned migration is approved.

The latest specification is not adopted solely because it is latest. Toolchain
support is verified and the version choice is recorded in an ADR.

The OpenAPI contract describes cloud capabilities only. `LOCAL` workflows call
storage-neutral application interfaces directly and MUST NOT add an HTTP round
trip merely to resemble cloud mode. Shared command/result schemas belong in
versioned contracts usable by both adapters.

## Resource and versioning model

- Public HTTP endpoints use `/api/v1`; nouns represent resources, not
  implementation actions.
- Breaking semantic or schema changes require a new major API version.
- Additive changes are backward-compatible only when clients can safely ignore
  them under the schema contract.
- Deprecation includes response metadata/documentation, replacement, migration
  guide, telemetry, and a published sunset window.
- Internal module interfaces and asynchronous events are versioned separately.

## Representation

| Concern            | Convention                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Media              | JSON; UTF-8; explicit content types                                                                          |
| Errors             | RFC 9457 `application/problem+json` with stable type URI/code, correlation ID, safe detail, and field errors |
| Identifiers        | Opaque strings; clients infer no sequence or entity type                                                     |
| Instants           | RFC 3339 UTC offset timestamps                                                                               |
| User-day semantics | Local date/time plus IANA timezone and recorded instant                                                      |
| Quantities         | Decimal serialized as a contract-defined number/string, explicit unit and basis                              |
| Unknown values     | Null/omitted only according to schema, with reason where material; never synthetic zero                      |
| Enums              | Declared evolution policy; unknown future values handled deliberately                                        |
| Provenance         | Compact reference in normal output; expandable evidence resource for audit                                   |

## Commands and concurrency

- Retriable create/action requests use a scoped `Idempotency-Key`; the server
  stores outcome semantics, detects mismatched replay, and returns the original
  compatible result.
- Mutable resources use ETag/`If-Match` or an explicit version to prevent lost
  updates.
- Commands validate authorization, consent, eligibility, units, and invariants
  at the application boundary.
- Optimizer/recomputation requests that exceed synchronous budget return
  `202 Accepted`, a job resource, status URL, and optional retry hint.
- Cancellation is best-effort and has an explicit terminal state.
- Entitlement checks are server-authoritative for paid/cost-incurring work;
  client plan labels, cached counters, or hidden controls never grant access.
- Hosted AI creates an action resource with a stable idempotency identity and a
  visible usage state: reserved, consumed, or released. Provider retries remain
  inside the same action.
- Migration/sync commands include source authority epoch, manifest/schema
  version, stable command ID, and expected logical versions. Timestamps alone
  never resolve conflicts or transfer authority.
- Assistant tool calls use allowlisted typed operations and a short-lived
  confirmation token bound to principal, arguments, policy version, expiry,
  and intent for any write or consequential action.

## Collections

Cursor pagination is the default for mutable or large collections. Responses
contain items and opaque next/previous cursor links where supported. Sort order
is stable and documented; filters are allowlisted and bounded. Page-number
pagination is reserved for immutable/small datasets where it is demonstrably
safe.

## Status and error semantics

| Situation                                  | Typical status                        |
| ------------------------------------------ | ------------------------------------- |
| Successful read/create/update/delete       | 200 / 201 / 200-or-204 / 204          |
| Durable work accepted                      | 202                                   |
| Validation or malformed request            | 400                                   |
| Unauthenticated / unauthorized             | 401 / 403 without resource disclosure |
| Missing resource                           | 404                                   |
| Version/idempotency conflict               | 409 or 412 as contractually defined   |
| Semantically valid but unprocessable input | 422                                   |
| Rate limited                               | 429 with safe retry metadata          |
| Dependency unavailable / not ready         | 503                                   |

Domain outcomes such as NEEDS_INPUT, INFEASIBLE, or OUT_OF_SCOPE are typed
business results when the HTTP request itself succeeded; they are not disguised
as server errors.

Usage exhaustion is a typed entitlement outcome with reset/cycle metadata; it
does not pretend to be a transient transport failure. A technical/provider
failure releases a reservation according to the usage policy and returns safe
retry semantics. A complete draft already shown to the user remains consumed
even when later rejected.

## Security and privacy

OAuth 2.0/OIDC scopes and ownership checks are explicit per operation.
Sensitive fields are minimized and never placed in URLs, error details, logs,
traces, cache keys, or examples. Field-level purpose/consent rules are enforced
server-side. Rate limits are principal/operation-aware and do not reveal other
users' existence.

## References

- [OpenAPI specification](https://spec.openapis.org/oas/latest.html)
- [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)
- [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
