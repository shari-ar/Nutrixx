# Reference quality source

| File                        | Responsibility                                                     |
| --------------------------- | ------------------------------------------------------------------ |
| `priority.ts`               | Gap contract, evidence validation, stable identity, and ranking    |
| `priority.test.ts`          | Deterministic scores, safety bands, unknown evidence, and failures |
| `work-queue.ts`             | Food-by-food coverage candidates from a pinned catalog             |
| `work-queue.test.ts`        | Latest-revision, gap-reason, alias, and usage-order checks         |
| `intake.ts`                 | Provenance-rich local proposal and per-claim validation            |
| `intake.test.ts`            | Known zero, four domains, invalid evidence, and quarantine checks  |
| `release-candidate.ts`      | Independent review decisions and deterministic projection          |
| `release-candidate.test.ts` | Review gates, known zero, and provenance fixtures                  |
| `index.ts`                  | Explicit public API                                                |

Pure functions in this package make no network or storage requests.
