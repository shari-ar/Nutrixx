# Requirement and evidence traceability

| Field         | Value                                            |
| ------------- | ------------------------------------------------ |
| Status        | Proposed                                         |
| Audience      | Product, engineering, quality, science, security |
| Owner         | Nutrixx Quality                                  |
| Last reviewed | 2026-09-22                                       |

## Trace chain

```text
Product principle
→ FR/QR requirement
→ risk / scientific policy / ADR
→ contract + domain invariant + implementation
→ verification case / evaluation metric
→ release evidence
→ production SLI and review signal
```

Every accepted requirement has a unique ID. Every safety/scientific rule and
material risk has its own ID. Tests and evaluation cases reference those IDs
directly; file paths alone are not durable traceability.

## Initial target trace map

This map links proposed requirements to their design authority. It is not
implementation or release evidence.

| Requirement   | Primary design authority                                  | Required verification family                                                                    |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| FR-001        | Privacy model, security baseline, API conventions         | Authn/authz, consent, export/deletion integration and privacy tests                             |
| FR-002        | Product constitution, critical workflows                  | Eligibility fixtures and onboarding usability research                                          |
| FR-003–FR-004 | Canonical model, nutrition foundation, publication policy | Golden food/recipe, versioning, unit and data-quality tests                                     |
| FR-005–FR-006 | Domain model, workflows, health-context engine            | Contract, authorization, correction/time/source integration tests                               |
| FR-007        | Daily Nutrition State engine                              | Scientific golden, property, timezone and recomputation tests                                   |
| FR-008–FR-010 | Optimizer engine                                          | Feasibility, safety, practicality, replay and explanation evaluation                            |
| FR-011–FR-012 | Data publication and architecture                         | Quarantine, release, impact, activation and rollback tests                                      |
| FR-013        | Health context, privacy/applicability, threat model       | Consent, mapping, source fidelity, isolation and eligibility tests                              |
| FR-014        | Evidence policy and security model                        | Approval, separation-of-duty and audit-integrity tests                                          |
| QR-001–QR-003 | Optimizer and evaluation strategy                         | Mandatory safety, replay and explanation release gates                                          |
| QR-004        | Product constitution and workflows                        | Instrumented task-time/error/correction usability study                                         |
| QR-005–QR-007 | Target architecture and quality scenarios                 | Failure isolation, load, job and solve-budget tests                                             |
| QR-008–QR-010 | Privacy, security and operating model                     | Telemetry scan, ASVS evidence, backup/restore exercise                                          |
| QR-011        | Domain boundaries and ADR-0001                            | Architecture/dependency tests                                                                   |
| QR-012-QR-013 | Product flows, canonical model, quality strategy          | Automated plus human accessibility, localization, RTL/LTR, timezone and unit-display evaluation |

## Minimum traceability record

| Field                                | Required              |
| ------------------------------------ | --------------------- |
| Requirement ID and version           | Yes                   |
| Owner and status                     | Yes                   |
| Rationale / linked risk              | Yes                   |
| Applicable populations/environments  | When relevant         |
| Policy/ADR/contract links            | Yes                   |
| Automated/manual evidence IDs        | Yes                   |
| Release-blocking threshold           | Yes                   |
| Production signal and review cadence | For operable behavior |
| Approved exception, owner, expiry    | If not satisfied      |

## Change impact

A change to a requirement, API, canonical identifier, unit, food dataset,
scientific rule, engine, solver, user claim, or security boundary queries the
trace graph and identifies affected tests, historical comparisons, documents,
alerts, and approvals.

CI SHOULD validate referential integrity of IDs and require evidence coverage
for all release-blocking requirements. A later machine-readable manifest may
generate the human matrix; duplicate manually maintained matrices are avoided.
