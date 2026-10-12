# Optimizer engine source

| File                        | Responsibility                                          |
| --------------------------- | ------------------------------------------------------- |
| `planning-contract.ts`      | Typed snapshot, outcome, run record, and fingerprinting |
| `planning-contract.test.ts` | Boundary and replay-contract fixtures                   |
| `index.ts`                  | Public package surface                                  |

The schemas describe frozen facts and references. They validate shape and
cross-references; a separate validator establishes scientific and safety
validity before a plan reaches the user.
