# ADR-0001: Modular monolith with explicit domain boundaries

| Field                      | Value                                       |
| -------------------------- | ------------------------------------------- |
| Status                     | Proposed                                    |
| Date                       | 2026-09-22                                  |
| Deciders                   | Product, Architecture, Platform Engineering |
| Owner                      | Nutrixx Architecture                        |
| Related requirements       | QR-005, QR-011; QS-03, QS-09                |
| Supersedes / superseded by | None                                        |

## Context and problem

Nutrixx contains multiple domains and compute profiles, but the product,
scientific policies, data model, team topology, and operating scale are still
evolving. Starting with network-separated microservices would add distributed
transactions, contract rollout, observability, deployment, and data-ownership
cost before those boundaries are proven.

At the same time, an unstructured monolith would make scientific engines hard
to test, enable shared-table coupling, and prevent later isolation.

## Decision drivers

- Strong transactions for early user/data workflows.
- Framework-independent and auditable nutrition/optimizer engines.
- Clear ownership, testability, and an extraction path.
- Low operational burden while product boundaries are learned.
- Failure isolation for long-running imports, recomputation, and optimization.

## Considered options

1. Modular monolith API plus separately deployed background workers.
2. Independently deployed microservices per bounded context.
3. Layered monolith with shared repositories/tables.
4. Serverless functions per operation.

## Decision

Build a NestJS modular monolith with bounded-context modules, explicit public
application interfaces, module-owned persistence adapters, architecture tests,
and transactional outbox events. Run imports, recomputation, and optimization
as separately deployed worker processes reusing the same domain/application
packages.

The nutrition and optimizer engines remain pure packages without NestJS,
database, network, or environment dependencies.

## Consequences

### Positive

- Simpler transactions and local development.
- Lower initial operational complexity.
- Fast refactoring while boundaries are validated.
- Pure engines are portable, replayable, and independently testable.
- Workers isolate compute and retry behavior from request latency.

### Negative / trade-offs

- Module boundaries require active automated enforcement.
- API and workers may initially share a release cadence.
- One database remains a potential coupling point despite logical ownership.
- Scaling the API process cannot independently scale an in-process synchronous
  module; heavy work must move to workers.

## Validation and review triggers

CI fails circular dependencies, domain-to-framework imports, and cross-module
repository/table access. Reconsider extraction when a module has independently
measured scaling, isolation, availability, security, runtime, release-cadence,
or stable team-ownership needs that exceed the monolith's benefits.
