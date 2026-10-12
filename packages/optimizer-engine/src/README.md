# Optimizer engine source

| File                          | Responsibility                                            |
| ----------------------------- | --------------------------------------------------------- |
| `planning-contract.ts`        | Typed snapshot, outcome, run record, and fingerprinting   |
| `planning-contract.test.ts`   | Boundary and replay-contract fixtures                     |
| `candidate-selection.ts`      | Eligible source and portion preparation with soft signals |
| `candidate-selection.test.ts` | Exclusion, evidence, portion, and ordering fixtures       |
| `local-search.ts`             | Bounded exact-hard, heuristic-soft local beam search      |
| `local-search.test.ts`        | Feasibility, limit, cancellation, and replay fixtures     |
| `plan-validation.ts`          | Independent plan validation, alternatives, and claims     |
| `plan-validation.test.ts`     | Hard-limit, exclusion, alternative, and claim fixtures    |
| `index.ts`                    | Public package surface                                    |

The schemas describe frozen facts and references. Candidate preparation applies
eligibility, declared exclusions, source freshness, supported hard upper-limit
prechecks, and evidence-qualified soft ordering. A separate validator establishes
full-plan scientific and safety validity before a plan reaches the user.
The search produces a draft. The review path recomputes the full selection and
promotes it to a `READY` outcome after every hard rule and explanation claim
passes validation. Each suggested replacement receives the same full-plan
validation.
