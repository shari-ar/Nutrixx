# Optimizer engine source

| File                          | Responsibility                                            |
| ----------------------------- | --------------------------------------------------------- |
| `planning-contract.ts`        | Typed snapshot, outcome, run record, and fingerprinting   |
| `planning-contract.test.ts`   | Boundary and replay-contract fixtures                     |
| `candidate-selection.ts`      | Eligible source and portion preparation with soft signals |
| `candidate-selection.test.ts` | Exclusion, evidence, portion, and ordering fixtures       |
| `local-search.ts`             | Bounded exact-hard, heuristic-soft local beam search      |
| `local-search.test.ts`        | Feasibility, limit, cancellation, and replay fixtures     |
| `index.ts`                    | Public package surface                                    |

The schemas describe frozen facts and references. Candidate preparation applies
eligibility, declared exclusions, source freshness, supported hard upper-limit
prechecks, and evidence-qualified soft ordering. A separate validator establishes
full-plan scientific and safety validity before a plan reaches the user.
The search produces a draft rather than an independently validated plan.
