# Privacy and regulatory applicability

| Field         | Value                                                |
| ------------- | ---------------------------------------------------- |
| Status        | Proposed policy; jurisdiction and legal review open  |
| Audience      | Product, privacy, security, architecture, operations |
| Owner         | Nutrixx Privacy                                      |
| Last reviewed | 2026-09-27                                           |

## Privacy model

| Lifecycle stage | Required behavior                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Purpose         | Name the user value, lawful/contractual basis where applicable, owner, and prohibited secondary use |
| Collect         | Minimum fields, progressive collection, just-in-time explanation, separate optional consent         |
| Use             | Enforce purpose and consent at the application boundary; no silent training/analytics reuse         |
| Store           | Classify, segregate, encrypt, minimize replicas, control access, record provenance                  |
| Share           | Contracted and allowlisted recipient/purpose; minimum payload; user visibility where required       |
| Retain          | Field/category schedule with rationale, legal hold handling, and deletion verification              |
| Export          | Authenticated, portable, understandable bundle with provenance and timestamps                       |
| Delete          | User-visible workflow covering primary data, derived data, integrations, caches, and backup expiry  |
| Audit           | Record access and consequential changes without copying sensitive payloads into logs                |

Consent is specific, informed, revocable, and distinct from required processing.
Withdrawal stops future optional processing immediately; retained data follows
the documented legal/operational policy.

## Storage-mode privacy

| Mode or action                | Required privacy behavior                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free `LOCAL`                  | User nutrition content stays within the browser origin. Static/reference delivery, telemetry, and optional account creation MUST NOT upload it. Browser persistence limits and loss risks are explained truthfully.  |
| Pro/Ultimate `CLOUD`          | Cloud purposes, recipients, region, retention, backup expiry, and rights are disclosed before authority promotion. Access is authenticated, authorized, encrypted, and audited.                                      |
| Upgrade                       | Upload enters isolated staging; authority changes only after integrity verification and user-visible success. Local canonical content is removed only after verified activation and recovery readiness.              |
| Downgrade/cancellation        | A local portable copy is generated and verified before cloud authority retires. A disclosed read-only recovery period precedes policy-driven deletion. Payment failure never causes immediate irreversible deletion. |
| Experimental Local Processing | The user explicitly enables each provider/device processing mode after seeing data destination, credential model, model/download size, retention, and known limitations. It is off by default.                       |

Direct browser-to-provider AI does not make Nutrixx the custodian of the
provider credential, but it does not make the flow risk-free. The UI MUST name
the external recipient, disclose that its policy applies, minimize the payload,
and offer a memory-only credential option where technically feasible. Provider
credentials never enter exports, telemetry, service workers, or Nutrixx APIs.

User content is not used to train general models or for unrelated product
analytics without a separately approved purpose and valid consent/legal basis.
Assistant context is assembled per request under least privilege; durable
conversation memory is opt-in and independently deletable.

## Data classification

| Class                     | Examples                                                        | Baseline                                                         |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Restricted                | Credentials, tokens, encryption keys                            | Dedicated secret systems; never application-readable beyond need |
| Sensitive health/personal | Intake, measurements, goals, labs, medications, inferred states | Encryption, strict purpose/role controls, no telemetry payloads  |
| Confidential product      | Algorithms, licensed datasets, evaluation corpora               | Role controls, license enforcement, integrity checks             |
| Internal operational      | Non-sensitive job IDs, deployment metadata                      | Authenticated access and retention                               |
| Public                    | Published documentation and approved catalog content            | Integrity and license controls                                   |

Customer sovereignty requires usable export, correction, cancellation,
downgrade, and recovery paths. These rights remain subject to legal retention,
fraud/security evidence, safety, and other people's rights; exceptions are
specific, documented, and time-bounded.

## Intended-use and claims boundary

The initial product is documented as general wellness for consenting adults.
It does not diagnose, treat, cure, prevent disease, alter medication, or claim
that intake alone proves clinical deficiency. Every user-facing claim and
feature is reviewed against its actual behavior, marketing language, target
population, and market.

## Applicability is a decision, not an assumption

HIPAA, GDPR/UK GDPR, consumer health privacy laws, medical-device rules, and
other regimes may apply depending on entity relationships, geography, data,
intended use, claims, and integrations. Nutrixx MUST maintain a jurisdiction
and regulatory applicability matrix before public launch. This document does
not declare compliance.

At minimum the matrix records:

- launch markets and user populations;
- entity/controller/processor or covered-entity/business-associate roles;
- data classes and cross-border/third-party flows;
- intended-use/claims classification;
- consent/legal basis, rights, retention, breach, and child-age obligations;
- required assessments, contracts, registrations, or qualified review;
- accountable owner, evidence, and next review.

## References

- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
- [HHS guidance on health apps and APIs](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access-right-health-apps-apis/index.html)
- [NIST SP 800-66 Rev. 2](https://csrc.nist.gov/pubs/sp/800/66/r2/final)
- [FDA General Wellness policy](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)
