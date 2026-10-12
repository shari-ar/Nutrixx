# ADR-0013: Bounded local search and replay

| Field                      | Value                            |
| -------------------------- | -------------------------------- |
| Status                     | Accepted                         |
| Date                       | 2026-10-11                       |
| Deciders                   | Nutrixx Product and Optimization |
| Owner                      | Nutrixx Optimization Engineering |
| Resolves                   | OD-010                           |
| Related requirements       | FR-008–010; QR-001–003, QR-007   |
| Supersedes / superseded by | None                             |

## Context and problem

Free planning runs on supported browsers with a bounded device budget. The
server-side full optimizer can adopt a separate solver adapter in Stage 9.
Search termination, proof of infeasibility, and reproducibility need distinct
contracts before a local engine is implemented.

## Decision drivers

- Keep the local search deterministic, offline, cancelable, and responsive.
- Bound candidate count and computation on ordinary supported devices.
- Preserve a replayable explanation of every accepted result.
- Represent heuristic quality honestly.

## Considered options

1. Ship a browser-side mixed-integer solver for the Free profile.
2. Use an unbounded greedy search with a single best-plan label.
3. Use a pure TypeScript, versioned, bounded beam search with an independent
   validator and explicit termination status.

## Decision

Adopt option 3 for Stage 4. A dedicated Web Worker receives a frozen,
storage-neutral planning snapshot. Candidate generation sorts by stable
semantic keys, preserves user-pinned eligible candidates, and exposes at most
24 eligible meal candidates per slot. A meal candidate may contain a food or
recipe with resolved ingredient facts; the next work package defines its
exact typed shape. A candidate with a credible base serving has at most four
portion choices: 0.5, 1, 1.5, and 2 times that serving, further clipped by
validated bounds. A missing serving conversion yields a specific input or
candidate limitation.

The versioned Free search uses a beam width of 128 states and at most 30,000
state expansions per run. A five-second worker watchdog ends a run with
`SEARCH_LIMIT` and publishes no partial plan. The expansion cap determines
ordinary completed runs; the watchdog protects slower devices. The UI remains
responsive and supports cancellation. A later benchmark may change these
parameters through a new policy version and regression fixtures.

Only independently validated solutions are `FEASIBLE`. `OPTIMAL` and a
numerical optimality gap require a proven search bound; the Free heuristic
reports `optimalityGap: null`. `INFEASIBLE` requires a direct contradiction or
exhaustion of the complete finite candidate/portion space under the declared
scope. A pruned search with no draft reports `SEARCH_LIMIT` with a
`beam-pruning` reason. An expansion-capped or timed-out search reports its own
limit and reserves publication for an independently validated complete plan.
The application keeps `NEEDS_INPUT`, `OUT_OF_SCOPE`, and `ERROR` distinct.
A search-limit result retains its own status and reason. This distinction
follows established solver-status semantics.

Each accepted run stores locally a bounded immutable replay artifact: input
snapshot and revision IDs, normalized candidate facts and order, active food
and science releases, constraint/scoring/search versions, parameters, search
termination and expansion count, validation report, and output hash. The
artifact remains with local user data until the user clears it and participates
in verified export/import. The replay artifact preserves the facts needed to
interpret an accepted run across reference-cache eviction. Sensitive input
stays out of telemetry.

## Consequences

### Positive

- Free planning uses the existing browser stack without a solver download.
- Search limits and non-optimality remain explicit to users and evaluators.
- Frozen run inputs support exact local replay and later solver comparison.

### Costs and trade-offs

- The bounded candidate set can omit a better plan.
- A beam search may end without finding an available feasible plan; its status
  exposes that limitation.
- Immutable replay artifacts consume local storage and follow storage-pressure
  and export guidance.

## Validation and review triggers

Repeat identical snapshots across reload, browser sessions, and offline mode
and compare output hashes. Property and fixture tests distinguish FEASIBLE,
proven INFEASIBLE, SEARCH_LIMIT, cancellation, and watchdog termination.
Benchmark the one-day reference workload on each supported browser and a
published reference device before accepting the p95 latency target. Revisit
the search profile when the candidate model, device support, or measured
quality floor changes.

## References

- [WHATWG HTML Standard: Workers](https://html.spec.whatwg.org/multipage/workers.html)
- [Google OR-Tools: CP-SAT solver statuses](https://developers.google.com/optimization/cp/cp_solver)
