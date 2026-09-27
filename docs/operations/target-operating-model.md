# Target operating model

| Field         | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Status        | Proposed; provider-specific details deferred            |
| Audience      | Platform engineering, service owners, security, support |
| Owner         | Nutrixx Operations                                      |
| Last reviewed | 2026-09-27                                              |

## Environments

| Environment         | Purpose                                                   | Data rule                       | Promotion                                |
| ------------------- | --------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| Local/dev container | Reproducible development                                  | Synthetic only                  | Direct developer feedback                |
| Ephemeral preview   | Pull-request integration/UI review                        | Synthetic seeded data           | Built from immutable candidate           |
| Staging             | Production-like release, migration, resilience validation | Synthetic or formally sanitized | Same artifact/config shape as production |
| Production          | User service                                              | Real purpose-approved data      | Approved staged promotion                |

Browser-local persistence is a production data plane for Free even though it
is not Nutrixx-operated infrastructure. It therefore receives versioned schema
migrations, compatibility fixtures, storage diagnostics, export/recovery UX,
and client-side health signals that contain no nutrition payload.

Production data MUST NOT be copied to lower environments. The same immutable
artifacts move forward; they are not rebuilt per environment.

## Delivery and release

1. Build once from a reviewed commit with hermetic/locked dependencies.
2. Produce tests, OpenAPI bundle, SBOM, vulnerability results, provenance, and
   signed images/artifacts.
3. Validate migrations, compatibility, scientific/data versions, and rollback.
4. Deploy to staging; run smoke, contract, safety, and migration checks.
5. Promote progressively (canary/controlled cohort) with automatic health and
   regression checks.
6. Roll forward or back using the previous immutable artifact and compatible
   data/policy pointer.
7. Record the complete release evidence bundle.

Database changes use expand/migrate/contract and are backward-compatible across
the deployment window. Dataset/rule activation is decoupled from code deploy
and supports immediate rollback.

## Service level objectives

Final objectives require an approved reference load and product tier. Initial
indicators and proposed objectives:

| User journey / service | SLI                                                  | Proposed objective                               |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Authenticated API      | Good non-user-error responses / eligible requests    | 99.9% monthly                                    |
| Meal logging           | Successful durable writes within 500 ms server time  | 99% monthly                                      |
| Food search            | Successful eligible searches within accepted latency | 99% monthly; latency target after benchmark      |
| Planning jobs          | Valid terminal result within documented budget       | 99% excluding correct NEEDS_INPUT/OUT_OF_SCOPE   |
| State freshness        | Meal changes reflected in accepted state             | p95 within agreed freshness window               |
| Data publication       | Active release freshness and integrity               | Per provider cadence; zero unapproved activation |
| Local core             | Successful eligible local commands/calculations       | Objective set per supported browser/device class |
| Migration/sync         | Verified authority transition and acknowledged sync   | Zero unverified authority switches; latency after benchmark |
| Hosted AI capture      | Valid terminal draft or truthful failure within budget | Objective per plan/action after provider benchmark |
| Usage accounting       | Reservations reaching correct terminal state          | 100% reconciliation within approved window       |
| Assistant tools        | Authorized, validated, correctly confirmed invocation | Zero confirmation/ownership bypass in release gates |

Safety/integrity is a release invariant, not an error budget. Error budgets guide
reliability work and release pace; they never permit hard safety violations or
privacy/security exceptions.

## Observability

Nutrixx uses vendor-neutral OpenTelemetry traces, metrics, and structured logs.
Telemetry carries correlation/trace IDs, operation/module, version, status,
duration, safe error code, job/data/rule versions where non-sensitive, and SLI
labels.

Telemetry MUST NOT contain meal contents, profile/health fields, lab values,
tokens/secrets, raw request/response bodies, free-text user input, or high-
cardinality user identifiers. Allowlist schemas and automated scans enforce it.

Key signals:

- request availability, latency, saturation, and safe error taxonomy;
- queue depth/oldest age, retries, dead letters, worker saturation;
- optimizer status, latency, infeasibility and validator rejection;
- calculation failures, version/fingerprint coverage, state freshness;
- dataset quality, publication status, source freshness, rollback;
- authorization denials/anomalies and privacy-workflow completion;
- entitlement decisions, reservation age, reconciliation drift, provider cost
  and budget exhaustion without user prompts or nutrition content;
- migration stage/duration/failure class, manifest verification, sync lag and
  conflict rate without record payloads;
- assistant tool refusal/confirmation/error class and policy-version coverage;
- business-quality signals such as correction burden and plan rejection,
  separated from operational health.

Alert only when action is needed. Every page links to an owned runbook and is
tested.

## Resilience and recovery

- Timeouts, bounded retries with jitter, circuit breakers, and bulkheads are
  explicit per dependency.
- Commands/jobs are idempotent; poison work enters a visible dead-letter
  workflow.
- PostgreSQL uses encrypted backups and point-in-time recovery; object storage
  uses versioning/immutability appropriate to artifact class.
- RPO/RTO, retention, region strategy, and key-recovery procedures are accepted
  before launch.
- Restore drills run in isolation and verify application/domain integrity, not
  merely that files exist.
- Dependency and worker outages degrade honestly; no cached or generated plan
  bypasses current validation.
- Browser schema upgrades are rehearsed against retained historical fixtures;
  failure leaves the prior local authority recoverable.
- Usage reservations have a bounded lease and reconciliation worker; an
  uncertain provider outcome is investigated rather than guessed or silently
  charged.
- Provider cost and concurrency budgets can disable hosted AI independently
  without blocking manual logging, export, or deterministic state.

## Incident management

Severity considers user safety, privacy/security, scientific/data integrity,
availability, and blast radius. A single suspected unsafe recommendation or
unauthorized sensitive-data access can be high severity even with low volume.

Response flow:

```text
detect → classify → contain/kill switch → preserve evidence
→ communicate → remediate/restore → validate → learn → track actions
```

Blameless postmortems are expected, but ownership and deadlines are explicit.
Safety/data incidents can disable a rule set, dataset release, optimizer path,
integration, or claim independently of a full deployment.

## Launch gates

Production launch requires:

- approved intended use, eligibility/exclusion, and claims;
- regulatory/privacy applicability matrix and data lifecycle;
- accepted threat model and security baseline evidence;
- scientific policies, golden fixtures, optimizer safety validation;
- SLOs, dashboards, actionable alerts, on-call ownership, and runbooks;
- backup/restore evidence and incident exercises;
- deployment/rollback, migration, dataset/rule rollback tests;
- vendor/licence, secrets, capacity, and support readiness.

Plan-specific launch gates are cumulative:

| Plan | Additional gate |
| --- | --- |
| Free | Supported-browser matrix, local schema recovery, export/import, offline core, storage-risk UX, deterministic local planning evidence |
| Pro | Payment/entitlement reconciliation, verified cloud promotion/demotion, backup/restore, multi-device conflict tests, hosted capture quotas, full optimizer SLO/cost/runbooks |
| Ultimate | Pro gates plus higher-limit capacity/budget, assistant grounding and adversarial evaluation, tool confirmation/kill switch, support escalation and retention policy |

A plan is not publicly sold until its whole advertised contract passes. Internal
incremental delivery uses flags/cohorts and must not imply a partial paid plan.

## References

- [Google SRE: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE Workbook: Monitoring](https://sre.google/workbook/monitoring/)
- [Google SRE Workbook: Error Budget Policy](https://sre.google/workbook/error-budget-policy/)
- [OpenTelemetry specifications](https://opentelemetry.io/docs/specs/otel/)
