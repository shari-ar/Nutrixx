# Risks and technical debt

| Field         | Value                                              |
| ------------- | -------------------------------------------------- |
| Status        | Living target-state risk register                  |
| Audience      | Product, architecture, nutrition science, security |
| Owner         | Nutrixx Architecture                               |
| Last reviewed | 2026-09-22                                         |

| Risk                                                       | Impact                                  | Mitigation / decision trigger                                                                 |
| ---------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| False precision from incomplete food data                  | Unsafe trust and poor plans             | Evidence envelope, completeness indicators, abstention thresholds, dataset quality gates      |
| Scope drifting into medical advice                         | User harm and regulatory exposure       | Explicit intended use, eligibility gate, claims review, jurisdiction-specific applicability   |
| Optimizer finds mathematically valid but impractical plans | Low adherence and unsafe substitutions  | Portion/cuisine/time constraints, diversity objectives, independent validation, user feedback |
| Dataset or policy update changes historical meaning        | Loss of auditability                    | Immutable releases, effective dates, input snapshots, no silent historical rewrite            |
| Sensitive data leaks through telemetry                     | Privacy/security incident               | Schema allowlists, redaction, payload prohibition, automated log scans                        |
| Modular monolith decays into shared-table coupling         | Extraction and testing become expensive | Module-owned repositories, architecture tests, event/contracts, code ownership                |
| Async jobs duplicate or stall                              | Conflicting snapshots and poor UX       | Idempotency, leases, bounded retry, dead-letter workflow, reconciliation                      |
| Vendor lock-in                                             | Cost and migration risk                 | Ports/adapters for identity, solver, data providers, storage, notifications                   |
| Recommendation bias by culture or catalog coverage         | Exclusion and low plan quality          | Coverage metrics by cuisine/group, representative benchmarks, reviewer escalation             |
| Generative AI invents facts                                | Misleading or unsafe output             | No LLM authority for math/safety; explanation claims resolve to validated trace               |

## Debt policy

Technical debt MUST have an owner, consequence, trigger/expiry, and removal
plan. “Temporary” without those fields is not an accepted state. Safety,
privacy, scientific validity, and replayability debt cannot be waived by a
normal product deadline.
