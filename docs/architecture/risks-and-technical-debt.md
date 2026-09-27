# Risks and technical debt

| Field         | Value                                              |
| ------------- | -------------------------------------------------- |
| Status        | Living target-state risk register                  |
| Audience      | Product, architecture, nutrition science, security |
| Owner         | Nutrixx Architecture                               |
| Last reviewed | 2026-09-27                                         |

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
| Browser eviction, profile reset, or device loss             | Free user's only local copy is lost      | Persistence request, storage status, export reminders, versioned portable backup, truthful UX  |
| Local/cloud migration creates split-brain authority         | Divergent or duplicated user facts       | Explicit authority state machine, immutable manifest, hash/count verification, resumable staging |
| Browser-held provider credential is exposed by XSS          | Unauthorized AI spend or data disclosure | Prefer provider OAuth/short-lived tokens, strict CSP/Trusted Types, memory-only key option, clear risk disclosure |
| Client tampers with plan or usage state                      | Revenue loss and inconsistent access     | Server-authoritative entitlements and append-only usage ledger; client state is advisory only  |
| Hosted AI retry miscounts allowance                         | Unfair billing or uncontrolled cost      | Idempotent reservation IDs, consume/release terminal states, timeout reconciliation            |
| Assistant tool call exceeds user intent                     | Unauthorized change or harmful guidance  | Allowlisted typed tools, least privilege, contextual authorization, confirmation, audit trace  |
| Experimental model download harms constrained devices       | Poor performance, storage pressure       | Never automatic, capability check, size disclosure, cancellation, cleanup and fallback         |

## Debt policy

Technical debt MUST have an owner, consequence, trigger/expiry, and removal
plan. “Temporary” without those fields is not an accepted state. Safety,
privacy, scientific validity, and replayability debt cannot be waived by a
normal product deadline.
