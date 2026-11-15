# Planning outcome feedback and calibration

| Field         | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Status        | Active internal contract                                 |
| Audience      | Optimization, product, web, quality, nutrition science   |
| Owner         | Nutrixx Optimization Engineering                         |
| Last reviewed | 2026-11-12                                               |
| Code          | `@nutrixx/optimizer-engine/planning-outcome-feedback-v1` |

## Purpose

Planning forms a closed evidence loop. Every published recommendation becomes
a version-bound trial. User selection, recorded consumption and replacement by
a newer request become append-only events. A deterministic evaluator converts
these records into observation-only calibration cohorts.

```text
validated recommendation
→ presented trial
→ zero or more selections
→ recorded consumption | replacement | expiry
→ finalized outcome
→ version-matched calibration cohort
→ evaluation evidence
→ separately reviewed policy release
```

## Event model

| Record       | Authority                      | Essential links                                                                                          |
| ------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Trial        | Validated planning publication | Subject, run, problem, state, policy versions, first-ranked action, score, portion and validity boundary |
| `SELECTED`   | Explicit user action           | Trial, run, intention, selected candidate, portion, rank and suggested grams                             |
| `CONSUMED`   | Recorded meal ledger           | Trial, run, intention, meal, candidate, consumed instant and actual grams                                |
| `SUPERSEDED` | New planning request           | Trial, run, replacement instant and cause                                                                |

A trial preserves one immutable publication. Reselection creates another
`SELECTED` event and retains the complete path. Consumption resolves through
the matching intention. Meal records remain the authority for actual intake;
the feedback event provides the auditable planning link.

## Lifecycle projection

| State                  | Meaning                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `PRESENTED`            | The recommendation remains current and awaits a choice                     |
| `SELECTED_PENDING`     | The user selected an option and the validity window remains active         |
| `CONSUMED`             | A recorded meal resolves through the selected intention                    |
| `FINALIZED_UNSELECTED` | Expiry or replacement finalized a trial before selection                   |
| `FINALIZED_UNCONSUMED` | Expiry or replacement finalized a selected trial before linked consumption |

## Calibration cohorts

Trials enter the same cohort only when ranking policy, domain model, domain
adapter and independent-validator versions all match. This boundary keeps
behavioral evidence comparable across engine releases.

Each cohort reports:

- trial and finalized-trial counts;
- lifecycle coverage;
- selection rate across finalized trials;
- consumption follow-through across finalized selected trials;
- first-ranked selection rate;
- mean reciprocal selected rank;
- mean actual-to-suggested portion ratio.

Ratios use reduced exact fractions. A cohort enters `EVALUABLE` after 30
finalized trials under the active v1 evidence floor. Earlier cohorts retain
`COLLECTING` status and remain visible.

## Policy authority

Calibration reports carry `automaticPolicyMutation: false`. They provide
evaluation evidence and preserve the distinction between observed behavior and
nutrition authority. Any future change to objectives, constraints, target
weights, portions or horizon policy requires its own reviewed, versioned
release and verification evidence.

The current score expresses hierarchical nutrient distance rather than an
acceptance probability. Behavioral cohorts therefore measure rank usefulness
and follow-through. A future validated adherence model may add probability
calibration through a separate prediction contract.

## Browser integration

The local browser stores trials and events as integrity-protected canonical
planning records. Trial publication joins the run and replay artifact in one
atomic commit. Selection joins its intention and feedback event in one atomic
commit. Consumption reconciliation resolves recorded meals by intention and
repairs a missing derived consumption event before reporting or replanning.

The Planning page shows the active cohort status and core metrics. The panel
states that feedback remains observation evidence and preserves explicit policy
review.

## Invariants

1. Every event resolves to exactly one trial with the same owner and run.
2. Trial validity follows presentation time.
3. Selected rank belongs to the trial's comparable-candidate range.
4. Selection intention identities remain unique within a trial.
5. Consumption resolves to its exact selection, candidate and portion.
6. Event chronology follows trial presentation and recording time.
7. Each trial contributes to one lifecycle state and one version cohort.
8. Cohort lifecycle counts cover every trial exactly once.
9. Calibration evidence preserves policy immutability.

## Verification

Automated fixtures cover consumed, selected-unconsumed, unselected, expired,
superseded, reselection, version separation, portion ratios, duplicate events,
ownership and selection-consumption mismatches. Browser integration fixtures
cover atomic publication, canonical selection events, meal reconciliation and
cohort reporting.

## Related specifications

- [Next-meal planning](next-meal-planning.md)
- [Planning domain model](planning-domain-model.md)
- [Planning validation](planning-validation.md)
- [Planning decision replay](planning-replay.md)
- [Optimizer and recommendation engine](optimizer.md)
