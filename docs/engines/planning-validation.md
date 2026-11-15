# Planning validation and feasibility diagnosis

| Field         | Value                                                     |
| ------------- | --------------------------------------------------------- |
| Status        | Active normative design                                   |
| Audience      | Optimization, web, nutrition science, quality, operations |
| Owner         | Nutrixx Optimization Engineering                          |
| Last reviewed | 2026-11-11                                                |

## Purpose

Every published next-meal decision passes an independent validation boundary.
The boundary verifies the complete candidate census, the Decision Chain and a
structured feasibility proof. It turns READY, NEEDS_INPUT and INFEASIBLE into
auditable outcomes with exact candidate identities and recovery actions.

```text
frozen request + solver result
→ independent candidate classification
→ exact result comparison
→ deterministic feasibility diagnosis
→ solver-neutral Decision Chain
→ independent Decision Chain checker
→ publish READY | return structured NEEDS_INPUT | return INFEASIBLE
```

## Two independent checks

| Check            | Independent responsibility                                                                                                            | Evidence                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ranking review   | Reconstruct candidate eligibility, inventory, exclusions, evidence coverage, hard limits and portion support from frozen input        | Complete classification census, exact ranking comparison and traceable explanations |
| Decision checker | Parse the solver-neutral contract and verify validator identity, diagnosis version, classification coverage and conflict-set coverage | Approved Decision Chain or stable rejection codes                                   |

The operational adapter constructs the Decision Chain. The Decision Chain
checker lives in a separate module and uses the public contract as its input.
Replay applies both checks again from the immutable replay artifact.

## Feasibility diagnosis

The diagnosis contains:

- a versioned diagnosis identity;
- the complete processed candidate census;
- findings grouped by exact reason code and classification;
- sorted candidate identities for every finding;
- a deterministic greedy conflict cover;
- one typed recovery action for every finding.

| Status      | Contract meaning                                                        | Publication behavior                                |
| ----------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| READY       | At least one comparable candidate passed the complete census            | Publish the ranked next-meal result                 |
| NEEDS_INPUT | Additional user, catalog or preparation evidence enables a new decision | Return the exact evidence gap and recovery route    |
| INFEASIBLE  | Current hard facts block every candidate in the complete census         | Return a complete conflict cover and recovery route |

The conflict cover selects the smallest deterministic sequence produced by the
versioned greedy-cover policy. It covers every blocked candidate and preserves
all detailed findings for inspection. It serves as a useful conflict set rather
than a claim of mathematical minimum cardinality.

## Recovery vocabulary

| Resolution                 | Typical evidence gap                                  |
| -------------------------- | ----------------------------------------------------- |
| `COMPLETE_HISTORY`         | Required intake history coverage                      |
| `CURATE_REFERENCE_DATA`    | Nutrient, restriction or hard-limit evidence          |
| `RESOLVE_PREPARATION`      | Edible yield or portion evidence                      |
| `UPDATE_INVENTORY`         | Declared available ingredients                        |
| `REVIEW_RESTRICTIONS`      | Declared exclusions or allergens                      |
| `REVIEW_HARD_LIMIT`        | A policy hard limit reached by every eligible portion |
| `EXPAND_SEARCH`            | Candidate coverage or continuation search             |
| `INSTALL_CANDIDATE_CORPUS` | Eligible offline catalog availability                 |

## Publication invariants

1. `processed` equals `total`, and classification counts sum to `total`.
2. Every candidate identity appears under one classification.
3. Diagnosis status agrees with the complete census and outcome status.
4. READY carries an empty, complete conflict set.
5. NEEDS_INPUT and INFEASIBLE carry a complete conflict cover.
6. Feasible action count equals the comparable candidate count.
7. The recommended action is the first-ranked feasible action.
8. Validator and diagnosis versions enter the replay fingerprint.

## Browser behavior

The browser publishes and persists only READY decisions. NEEDS_INPUT and
INFEASIBLE return their structured diagnosis directly to the planning UI. The
UI presents the state, decisive reason codes and the relevant recovery route.
Each new request rebuilds the diagnosis from current frozen facts.

## Verification

Automated fixtures cover READY, missing evidence, inventory infeasibility,
empty candidate corpora, altered conflict coverage, altered validator identity
and diagnosis/outcome disagreement. Replay fixtures verify the same boundary
after persisted evidence is reconstructed.

## Related specifications

- [Next-meal planning](next-meal-planning.md)
- [Planning domain model](planning-domain-model.md)
- [Planning decision replay](planning-replay.md)
- [Optimizer and recommendation engine](optimizer.md)
- [Verification and evaluation](../quality/verification-and-evaluation.md)
