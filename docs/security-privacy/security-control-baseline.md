# Security control baseline

| Field         | Value                             |
| ------------- | --------------------------------- |
| Status        | Proposed                          |
| Audience      | Engineering, security, operations |
| Owner         | Nutrixx Security                  |
| Last reviewed | 2026-09-27                        |

Internet-facing releases target OWASP ASVS 5.0 Level 2, supplemented by
risk-selected controls and the threat model. A checklist is not proof of
security; each applicable control maps to implemented evidence.

| Control area          | Baseline                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/session      | OIDC standards, PKCE, secure cookie/token lifecycle, MFA capability, session inventory/revocation                                                                   |
| Authorization         | Deny by default, ownership/purpose/role checks server-side, separate privileged plane                                                                               |
| Input/output          | Schema validation, canonicalization, bounded size/complexity, contextual encoding, safe file/import handling                                                        |
| Cryptography          | Modern TLS, managed KMS/secret storage, encryption at rest, documented key rotation                                                                                 |
| Data protection       | Classification, minimization, masked lower environments, export/deletion controls, no sensitive telemetry                                                           |
| Application integrity | Typed domain invariants, transactions, idempotency, audit of consequential actions                                                                                  |
| Supply chain          | Lockfiles, dependency review, pinned actions/images, SBOM, provenance/signing, vulnerability/secret scanning                                                        |
| Infrastructure        | Least privilege identities/network paths, hardened images, immutable deploys, patch policy                                                                          |
| Logging/detection     | Structured allowlisted events, tamper resistance, correlation, actionable alerts, protected retention                                                               |
| Resilience            | Rate/budget limits, timeouts, circuit breakers, backups/PITR, restore and incident exercises                                                                        |
| Secure delivery       | Threat-model delta, code review, SAST/dependency/container/IaC scans, security regression gate                                                                      |
| Browser-local data    | Origin isolation, strict CSP, Trusted Types where supported, dependency integrity, schema migration tests, explicit clear/export, no sensitive service-worker cache |
| Provider credentials  | Prefer OAuth/short-lived scoped tokens; never proxy or persist BYOK without a separate explicit contract; memory-only option and redacted diagnostics               |
| Entitlements/usage    | Server-authoritative grants, signed/validated billing events, idempotent reservation ledger, replay protection, reconciliation                                      |
| Migration/sync        | Authenticated encrypted transfer, per-chunk and manifest hashes, ownership binding, single-authority switch, resumability, cleanup audit                            |
| Generative AI/tools   | Treat output as untrusted, typed schemas, allowlisted tools, least privilege, prompt-injection defenses, confirmation and immutable trace for consequential actions |

## Release evidence

A release candidate records applicable ASVS controls, automated/manual test
results, unresolved vulnerabilities and risk acceptance, threat-model delta,
SBOM/provenance, secrets scan, restore status, and approvers.

Critical/high findings affecting an exposed path, authorization, sensitive
data, or scientific policy integrity block release unless a formal exception
with expiry, owner, evidence, compensating control, and accountable approval is
accepted. A known hard-safety invariant or independent-validator failure is
non-exemptible: the defect must be fixed, or the affected capability must be
fully disabled and that containment independently verified before release.

References:

- [OWASP ASVS 5.0](https://owasp.org/projects/asvs)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework)
