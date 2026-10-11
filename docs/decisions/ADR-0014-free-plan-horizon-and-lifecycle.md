# ADR-0014: Free plan horizon and lifecycle

| Field                      | Value                              |
| -------------------------- | ---------------------------------- |
| Status                     | Accepted                           |
| Date                       | 2026-10-11                         |
| Deciders                   | Nutrixx Product                    |
| Owner                      | Nutrixx Product                    |
| Resolves                   | OD-011                             |
| Related requirements       | FR-008–010, FR-015; QR-002, QR-014 |
| Supersedes / superseded by | None                               |

## Context and problem

Free users need a practical plan after minimal input. Plans, recorded meals,
user feedback, and time-zone changes have different meanings and lifecycles.
The first Free release should make these distinctions visible without a
notification service or a multi-day adherence model.

## Decision drivers

- Make a useful next-meal recommendation from the local dashboard.
- Preserve recorded meals as facts and plans as proposals.
- Let the user inspect, accept, substitute, and correct a plan locally.
- Keep the first horizon and feedback semantics small and testable.

## Considered options

1. Generate an automatically accepted rolling multiweek plan with reminders.
2. Produce a single meal suggestion without a durable plan lifecycle.
3. Generate one explicit nutrition day at a time, with versioned draft and
   acceptance states and an in-app next-meal view.

## Decision

Adopt option 3 for Stage 4. The user selects the current or next nutrition day
under the effective-dated zone policy in
[ADR-0009](ADR-0009-nutrition-day-and-rolling-periods.md). The default is the
current day when an upcoming slot remains; otherwise it is the next day.
The Free horizon is one day, with one to four user-visible eating slots.
Three ordinary slots form the initial default, and the user can adjust the
slot count and labels before requesting a plan. Recorded meals on the chosen
day remain fixed facts; a current-day request fills only open future slots.

A request produces an immutable validated **draft**. The user explicitly
accepts or discards it. Acceptance creates the active local plan revision and
exposes its next proposed meal on the dashboard. A substitution request
creates a new draft for the affected slot, preserving the other accepted
slots where they remain valid; it passes the same eligibility, constraint,
validation, explanation, and freshness gates. Acceptance of a replacement
creates a new revision and retains the prior one for history and export.

Logging a meal records what was eaten in the consumption ledger and remains
separate from a proposed plan item. The UI may ask the user to link a meal
to a plan slot; a link or a user-marked skip is descriptive feedback, while
recorded consumption remains the authoritative intake fact. Plan acceptance
creates a plan revision; meal logging uses a separate consumption command.
An unlinked meal remains usable in nutrition calculations.
Adherence language describes logged versus proposed actions and avoids a
clinical or behavioral score.

Changes to restrictions, eligibility, relevant food/recipe revisions,
nutrition-day policy, or scientific rules make the active plan stale. The UI
retains the historical plan with its provenance and requests a new validated
run before presenting a stale suggestion as current. The Stage 4 experience
uses in-app dashboard status and optional user-opened plan views; scheduled
device, email, and push notifications belong to a later explicit consent and
delivery policy.

## Consequences

### Positive

- The user can reach a concrete next meal without a long onboarding flow.
- Plans, meal logs, revisions, and feedback retain separate meanings.
- The daily scope keeps local planning and correction understandable.

### Costs and trade-offs

- A one-day horizon provides less advance scheduling than the future full
  optimizer.
- A substitution requires a new validated draft and acceptance step.
- Adherence and notifications stay intentionally lightweight in Free version 1.

## Validation and review triggers

UI and ledger fixtures cover current/next-day selection, recorded meals,
draft/accept/discard, substitution, skipped or linked meals, zone transitions,
stale-plan handling, reload, offline use, export/import, and correction
history. Revisit this policy after observing actual plan-use and correction
patterns or before adding multi-day plans and reminders.
