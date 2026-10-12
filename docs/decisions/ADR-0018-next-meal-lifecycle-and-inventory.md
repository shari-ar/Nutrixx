# ADR-0018: Next-meal recommendation lifecycle and personal inventory

| Field                | Value                                      |
| -------------------- | ------------------------------------------ |
| Status               | Accepted                                   |
| Date                 | 2026-10-12                                 |
| Deciders             | Nutrixx Product                            |
| Owner                | Nutrixx Product                            |
| Resolves             | OD-011, revised; OD-015 in part            |
| Related requirements | FR-005, FR-008–010, FR-015; QR-002, QR-014 |

## Context and problem

The Free interaction centers on a ranked recommendation for the **next meal
only**, followed by optional adjustment and explicit recording of what the
user actually consumed. Some users also want suggestions limited to foods or
ingredients they report having at home.

## Decision drivers

- Make the next-meal list available with minimal user input.
- Keep a proposed recommendation separate from a consumed meal.
- Let a user select any ranked option and correct the consumed portion.
- Offer a strict, user-activated personal inventory scope.
- Preserve revision history, export, and freshness across corrections.

## Considered options

1. Keep the multi-slot day plan and rename its first item the next meal.
2. Auto-record the first-ranked food as consumed.
3. Generate one next-meal ranking, let the user choose freely, and commit a
   consumption record only after explicit confirmation.

## Decision

Adopt option 3. Opening the dashboard or Planning view can request or reuse a
fresh local ranking automatically. A loading state and an explicit refresh
control cover longer work. The current recommendation covers one upcoming
eating occasion. It creates no proposal for later slots or days. The user can
inspect the ordered list and choose any entry; choosing records a revisable
next-meal intention. The user can also leave the list without choosing.

The action **Log as eaten** asks for the actual food or recipe, edible amount,
and consumption time before creating a meal command in the authoritative
consumption ledger. The user can change the suggested item or portion during
that confirmation. A selected intention and a recorded meal retain distinct
identities and revisions; an optional link explains which suggestion led to
the log. An unlinked meal remains fully valid. Corrections to consumed meals
update the intake context for subsequent rankings. The interface describes
logged versus suggested actions without a clinical adherence score.

Personal inventory is an explicit optional filter named **Use my available
foods and ingredients**. The user can declare items, edible quantities, units,
preparation state, and optional expiry. In this mode, a direct-food suggestion
requires adequate declared stock for its proposed portion. A recipe requires
adequate quantities for every required ingredient at its versioned yield and
preparation state. Missing quantities or ambiguous ingredient matching route
an item to a visible availability-limited state. The planner generates no
unverified recipe or ingredient substitution. The mode applies only to the
next-meal request; the ordinary mode uses the full active local catalog.
Inventory is an availability assertion, while the consumption ledger remains
the dietary fact. An inventory adjustment follows a separate user-confirmed
action after preparation or consumption.

Changes to the profile, restrictions, meal history, inventory, time-zone
policy, food/recipe revisions, catalog release, or temporal science policy
make a cached recommendation stale. The prior result stays available as
history with its source context. A fresh local run supplies the current list.
The user-facing flow uses in-app status; scheduled notifications retain their
separate future consent boundary.

## Consequences

### Positive

- The normal path goes from opening the site to ranked next-meal options.
- Meal logging preserves what actually happened, including a changed choice
  or portion.
- Inventory mode gives user-declared stock an exact, optional scope.

### Costs and trade-offs

- Inventory entry takes time for users who enable that mode.
- Ingredient quantity, preparation, and recipe-yield matching need explicit
  evidence and user correction paths.
- A next-meal recommendation provides less forward scheduling than a day plan.

## Validation and review triggers

UI and ledger fixtures cover automatic ranking, selection of a lower-ranked
item, intention revision, actual-food and portion correction, separate meal
commit, inventory on/off, inadequate stock, incomplete ingredient matching,
meal correction, local reload, offline use, export/import, travel-zone changes,
and stale-result handling.
