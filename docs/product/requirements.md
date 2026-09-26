# Product requirements

| Field         | Value                                            |
| ------------- | ------------------------------------------------ |
| Status        | Proposed target state                            |
| Audience      | Product, engineering, quality, nutrition science |
| Owner         | Nutrixx Product                                  |
| Last reviewed | 2026-09-22                                       |

Requirements are outcome-oriented. Detailed schemas belong in contracts and
canonical models; algorithms belong in engine specifications. Every accepted
requirement MUST map to verification evidence before release.

## Functional requirements

| ID     | Requirement             | Acceptance outcome                                                                                                                                                      |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Identity and consent    | A user can create, secure, export, and delete an account and independently grant or revoke optional data uses.                                                          |
| FR-002 | Progressive profile     | Nutrixx starts with the minimum safe profile and asks for additional information only when it changes eligibility or result quality.                                    |
| FR-003 | Food knowledge          | The platform represents foods, preparations, portions, nutrients, provenance, confidence, and dataset versions without confusing missing with zero.                     |
| FR-004 | Recipe knowledge        | Users and curators can version recipes with ingredients, yields, preparation steps, and calculated nutrition. Historical consumption remains bound to the version used. |
| FR-005 | Consumption capture     | Users can log, edit, copy, and correct meals with quantities, local time, timezone, and source while preserving an audit trail.                                         |
| FR-006 | Activity and context    | Users can optionally record activity, sleep, body measurements, and compatible health observations with source and uncertainty.                                         |
| FR-007 | Daily nutrition state   | The system compares confidence-aware intake against applicable versioned targets and exposes coverage, gaps, limits, and data quality.                                  |
| FR-008 | Planning                | The system generates feasible daily or multi-day plans under hard safety constraints and soft preference, cost, time, variety, and waste objectives.                    |
| FR-009 | Explanation             | Every plan exposes its active constraints, important assumptions, nutrient trade-offs, unmet targets, quality limitations, and safe substitutions.                      |
| FR-010 | Infeasibility           | When no valid plan exists, the system names conflicting constraints and may suggest relaxing only eligible soft constraints.                                            |
| FR-011 | Dataset publication     | Curated food and scientific data pass staged validation and are published as immutable, reversible versions.                                                            |
| FR-012 | Recalculation           | A policy or dataset update triggers impact analysis and versioned recomputation without rewriting historical evidence.                                                  |
| FR-013 | Optional integrations   | Imported laboratory or device observations preserve original code, unit, timestamp, source, and reference context and never automatically create a diagnosis.           |
| FR-014 | Professional governance | Authorized reviewers can approve scientific policies, datasets, exclusions, and releases with attributable audit records.                                               |

## Quality requirements

| ID     | Requirement             | Target measure                                                                                                                                                     |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QR-001 | Safety integrity        | Zero hard-constraint violations in release-gate fixtures and independent post-solve validation.                                                                    |
| QR-002 | Reproducibility         | 100% of released derived states and plans carry a replayable input and version fingerprint.                                                                        |
| QR-003 | Explainability fidelity | 100% of numeric claims in explanations resolve to deterministic output; no language model may invent them.                                                         |
| QR-004 | Input efficiency        | Common meal logging requires no health questionnaire and supports reuse, search, favorites, recipes, and correction. Product research sets task-time targets.      |
| QR-005 | Availability isolation  | A planning-engine outage does not prevent authentication, food search, or consumption logging.                                                                     |
| QR-006 | API responsiveness      | Proposed initial objective: cached reads p95 under 300 ms and ordinary writes p95 under 500 ms at the documented reference load, excluding client network time.    |
| QR-007 | Planning latency        | Proposed initial objective: a normal one-day plan returns p95 under 10 seconds; longer work becomes an observable asynchronous job.                                |
| QR-008 | Privacy                 | Sensitive fields never appear in application logs, traces, metrics, analytics payloads, or support screenshots by default.                                         |
| QR-009 | Security                | Internet-facing releases meet the selected OWASP ASVS 5.0 Level 2 controls, plus risk-selected controls beyond that baseline.                                      |
| QR-010 | Recoverability          | RPO, RTO, retention, and restore-test frequency are approved before production; restore evidence is required before launch.                                        |
| QR-011 | Evolvability            | Bounded contexts own writes to their data and communicate through declared contracts; cross-context database writes fail architecture tests.                       |
| QR-012 | Accessibility           | User-facing flows target WCAG 2.2 AA and are verified with automated and human checks.                                                                             |
| QR-013 | Internationalization    | Locale, language, script direction, timezone, regional foods, and display units are explicit; presentation conversion never changes canonical calculation meaning. |

## Release traceability

Each requirement has one or more durable verification artifacts:

```text
Requirement → policy/ADR → contract or model → automated test/evaluation
            → release evidence → production signal
```

Proposed numeric targets become accepted only after a reference workload,
measurement method, and accountable owner are recorded.
