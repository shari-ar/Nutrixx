# Stage 2 local ledger acceptance protocol

| Field         | Value                                              |
| ------------- | -------------------------------------------------- |
| Status        | Active implementation acceptance protocol          |
| Audience      | Product, engineering, quality, accessibility, data |
| Owner         | Nutrixx Quality                                    |
| Last reviewed | 2026-10-05                                         |

## Objective

Stage 2 proves that a person can create a starting profile once, then locally
search foods, create custom foods and versioned recipes, log unlimited manual
meals, correct or remove a meal, and recover the retained history while
offline. Canonical facts remain in IndexedDB; reference catalog releases remain
in the separate cache.

## Automated evidence

| Evidence ID    | Scope                                                                                          | Required result |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| S2-DOMAIN-001  | Custom-food immutable versioning and explicit known/unknown values                             | Pass            |
| S2-DOMAIN-002  | Recipe identity, immutable versioning, ingredient references, and yield                        | Pass            |
| S2-DOMAIN-003  | Per-ingredient nutrient retention and atomic, independently referenced output-food publication | Pass            |
| S2-WEB-001     | Food → recipe → meal → correction → removal local golden flow                                  | Pass            |
| S2-WEB-002     | Accessible manual meal entry and recoverable empty state                                       | Pass            |
| S2-CATALOG-001 | USDA release manifest, artifact receipt, and SHA-256 verification                              | Pass            |
| S2-QUALITY-001 | Typecheck, lint, unit tests, and production Web build                                          | Pass            |

The test suites execute without a network request. The Stage 2 browser golden
flow asserts that correcting or removing a meal preserves immutable history and
that an explicit unknown nutrient value remains distinct from a measured zero.
It also verifies custom categories and portions, a user-entered cooking-loss
factor, a versioned output food in the food catalog, and consumption of that
food by exact version. Omitted cooking-loss factors leave the source composition
unadjusted and retention evidence unspecified.

## Human release evaluation

| Objective                  | Target                                                                    | Evidence method             |
| -------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| First one-item manual meal | Median ≤ 60 seconds; 90th percentile ≤ 90 seconds                         | Moderated task-time session |
| Copy and save a prior meal | Median ≤ 20 seconds; 90th percentile ≤ 30 seconds                         | Moderated task-time session |
| Correct an existing meal   | Median ≤ 30 seconds; 90th percentile ≤ 45 seconds                         | Moderated task-time session |
| Keyboard operation         | Every control reachable, operable, and visibly focused                    | Keyboard test               |
| Screen-reader operation    | Form labels, status, errors, history, and actions announced coherently    | NVDA and VoiceOver test     |
| Recovery                   | A participant reaches storage recovery guidance after a simulated failure | Moderated recovery scenario |

At least five representative adult participants complete the first three
tasks. A result records device, browser, assistive technology where used,
completion time, error count, observed workaround, and remediation owner.

## Exit evidence

Stage 2 becomes release-ready when the automated evidence passes for the
candidate, coverage corpora satisfy [ADR-0007](../decisions/ADR-0007-food-catalog-sources-and-release-quality.md), and the human evaluation targets pass with recorded evidence. Any exception names an owner, expiry, and remediation path.
