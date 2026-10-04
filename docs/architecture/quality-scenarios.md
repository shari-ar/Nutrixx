# Quality scenarios

| Field         | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Status        | Proposed; numeric objectives require benchmark approval |
| Audience      | Architecture, engineering, quality, operations          |
| Owner         | Nutrixx Architecture                                    |
| Last reviewed | 2026-09-27                                              |

Each scenario follows source → stimulus → environment → artifact → response →
measurable response.

| ID    | Quality              | Scenario and response measure                                                                                                                                                                     |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QS-01 | Safety               | Given any planner result, the independent validator rejects every hard-constraint violation before publication. Release fixtures permit zero escaped violations.                                  |
| QS-02 | Reproducibility      | Given a retained run fingerprint, an authorized evaluator can reconstruct the exact inputs, versions, configuration, status, and output hash for 100% of released plans.                          |
| QS-03 | Graceful degradation | If the optimizer or job queue is unavailable, authenticated users can still search cached/catalog data and log meals; planning returns a truthful retryable status rather than a fabricated plan. |
| QS-04 | Performance          | At the accepted reference load, ordinary API writes complete p95 under 500 ms and cached reads under 300 ms, measured server-side; the error rate remains within the SLO.                         |
| QS-05 | Planning latency     | A standard one-day request completes p95 under 10 seconds or becomes a status-tracked asynchronous job without duplicate runs.                                                                    |
| QS-06 | Data correctness     | Importing an unsupported unit, dimensional mismatch, duplicate canonical mapping, or missing source version quarantines the record and preserves the current active release.                      |
| QS-07 | Privacy              | Revoking an optional integration stops new collection immediately; deletion/export completes within the approved policy window and emits auditable evidence.                                      |
| QS-08 | Security             | A user requesting another user's resource receives no existence or content disclosure; authorization is enforced at every application boundary and covered by negative tests.                     |
| QS-09 | Evolvability         | Replacing a food provider or solver requires an adapter plus conformance tests while core domain contracts remain stable.                                                                         |
| QS-10 | Recoverability       | An operator restores the production database and object references into an isolated environment within approved RTO/RPO and verifies integrity through a scheduled drill.                         |
| QS-11 | Explainability       | Every user-visible numeric explanation resolves to a typed engine output and provenance trace; automated fixtures find zero untraceable numbers.                                                  |
| QS-12 | Accessibility        | Keyboard and assistive-technology users complete onboarding, meal logging, state review, and plan selection against WCAG 2.2 AA acceptance checks.                                                |
| QS-13 | Local resilience     | During a cloud outage, a supported Free browser with installed assets can manually log and edit facts, recalculate state, and export data without an account or silent network upload.            |
| QS-14 | Migration integrity  | If upload, verification, activation, or cleanup fails during a storage-mode transition, exactly one prior authority remains writable and all accepted source records remain recoverable.          |
| QS-15 | Usage accounting     | Concurrent submission, timeout, provider failure, and retry fixtures produce exactly one final consume or release decision for each hosted-AI action ID.                                          |
| QS-16 | AI action control    | Prompt-injection and malformed-output suites verify mandatory typed tool authorization, ownership checks, policy validation, and confirmation for writes and consequential actions.               |

## Priority

Safety, privacy, integrity, and reproducibility outrank latency or engagement.
When quality goals conflict, the decision is documented in an ADR or scientific
policy and remains visible above implementation details.

## Evidence

Each accepted scenario identifies:

- reference workload/dataset and environment;
- automated test, evaluation suite, or operational drill;
- signal, dashboard, and alert when applicable;
- owner and review cadence;
- release-blocking threshold and exception process.

See [arc42 quality requirements](https://docs.arc42.org/section-10/) for the
scenario method.
