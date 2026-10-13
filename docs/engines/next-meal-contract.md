# Free next-meal recommendation contract

| Field         | Value                                         |
| ------------- | --------------------------------------------- |
| Status        | Accepted target contract                      |
| Audience      | Engine, web, data, quality, nutrition science |
| Owner         | Nutrixx Optimization Engineering              |
| Last reviewed | 2026-10-13                                    |

This is the single normative Stage 4 contract for the Free local recommendation
engine. It specializes [the optimizer overview](optimizer.md) and implements
[history-aware constraints](../decisions/ADR-0016-history-aware-next-meal-constraints.md),
[complete catalog ranking](../decisions/ADR-0017-complete-local-next-meal-ranking.md),
[the next-meal lifecycle](../decisions/ADR-0018-next-meal-lifecycle-and-inventory.md),
and [the Free quality floor](../decisions/ADR-0019-free-next-meal-quality-floor.md).
The recommendation concerns **one upcoming eating occasion**. Future paid
multi-meal optimization has its own capability boundary.

## Boundary and identity

The application freezes a storage-neutral input snapshot. A browser worker
computes a typed outcome; an independently implemented validator verifies
published results. The application persists the immutable run and handles the
user's later selection and consumption commands. Each boundary uses canonical
decimal quantities, explicit units and edible bases, stable IDs, UTC instants,
an effective IANA time zone, exact source revisions, and versioned policies.

The target wire format is `nutrixx.next-meal-recommendation`, with
`schemaVersion: 1`. This identifies one private-MVP contract rather than a
compatibility chain. Before the first public release, the existing planner
implementation is replaced in place; Git history retains its earlier shape.

| Identity         | Meaning                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `requestId`      | Idempotent identity of one requested next-meal evaluation.            |
| `runId`          | Identity of one immutable execution attempt for that request.         |
| `ownerSubjectId` | Local canonical subject; every referenced user record has this owner. |
| `candidateKey`   | Stable food-or-recipe identity plus exact revision within the run.    |
| `intentionId`    | Separate, revisable user selection from a validated run.              |
| `mealId`         | Authoritative consumed-meal identity created by explicit logging.     |

## Frozen input

`NextMealInput` is a strictly validated record. Its top-level fields and
required nested facts are:

| Field                   | Required facts                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request`               | Format, schema version, request/owner IDs, capture instant, effective nutrition-day policy and time zone, and one upcoming eating occasion.                                                                                                                                                                         |
| `eligibility`/`profile` | Exact profile/restriction revisions, eligibility result and reasons, declared exclusions, preferences, and their evidence.                                                                                                                                                                                          |
| `recordedIntake`        | Accepted meal and correction revisions overlapping the maximum active lookback, event instants, edible quantities, resolved nutrient observations, unknown reasons, and source revisions.                                                                                                                           |
| `temporalRules`         | Exact policy release; for each active nutrient/reference comparison: nutrient, population, reference type/release, source scope, time basis, window or period count, aggregation, unit, separate reference and horizon citations, minimum known-meal count, early-history treatment, limitations, and rule version. |
| `targets`               | Applicable targets and hard limits with their source scope, units, horizon, approval state, and release IDs.                                                                                                                                                                                                        |
| `catalogManifest`       | Every active installed food/recipe release and current user-food/user-recipe revision included in the census, with stable identity and content digest.                                                                                                                                                              |
| `candidateFacts`        | For every catalog entry: source identity/revision, preparation and edible basis, supported portions and bounds, composition and provenance, restriction evidence, and recipe ingredient requirements where applicable.                                                                                              |
| `inventory`             | Explicit `ALL_CATALOG` or `AVAILABLE_ONLY` mode; the latter carries exact inventory revision, item identity, edible quantity/unit, preparation state, and material matching uncertainty.                                                                                                                            |
| `policy`                | Exact classification, constraint, scoring, tie-break, validation, and worker-budget policy versions.                                                                                                                                                                                                                |

The catalog snapshot may use immutable content-addressed local blobs referenced
by the manifest, while the input fingerprint covers their ordered identities
and digests. A run resolves and verifies every required blob before declaring
complete coverage. Pagination and worker batching change memory usage while
preserving the logical full-catalog snapshot.

Recorded meals are the intake authority. Suggestions, intentions, and gaps in
logging contribute no inferred intake. Each temporal comparison uses its own
source-backed window; the effective nutrition-day boundary and elapsed-time
windows are distinct. Short available history follows the rule's explicit
`provisional-comparison` or `omit-rule` treatment after its minimum known-meal
count is met. A provisional comparison retains its shorter observed span and
qualification in the explanation. Unknown nutrient composition, unmatched
units, and unsupported references produce explicit evidence states. Biological
residence time alone supplies no intake-comparison rule. A hard upper limit
uses its declared horizon and source scope, independently of earlier deficits.
The published recommendation states the assumption of complete user logging
without requesting a separate confirmation. Its dietary estimate makes no
claim about measured body stores.
An explicit `minimumKnownMeals: 0` rule can support a first-meal estimate from
an empty accepted ledger under that displayed logging assumption. A recorded
meal with unknown nutrient composition remains unresolved rather than becoming
a zero-valued observation.

The versioned temporal-policy contract classifies a rule's recorded evidence
as full-horizon available, provisional short history, omitted short history,
insufficient recorded intake, or unresolved composition. Full-horizon
availability means tracking began by the window start; it remains an
assumption about logging, rather than proof that every meal was recorded.
An unresolved meal observation stays unknown. The rule-level decision is
independent of the later full-catalog ranking, which alone publishes a
recommendation after validation.

## Catalog classification and ranking

Every entry in the frozen catalog manifest receives exactly one primary
classification. Reason codes and evidence details remain attached to the
entry.

| Classification         | Meaning                                                                                                     | Ordered by nutrition score? |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------- |
| `COMPARABLE`           | Edible, available under the chosen mode, passes verified hard rules, and has comparable supported evidence. | Yes                         |
| `EVIDENCE_LIMITED`     | Eligible in principle; material evidence for a defensible comparison is incomplete.                         | No                          |
| `UNAVAILABLE`          | The selected inventory mode lacks a verified matching quantity or preparation state.                        | No                          |
| `EXCLUDED`             | A declared exclusion or verified hard rule blocks the candidate.                                            | No                          |
| `REQUIRES_PREPARATION` | The catalog entry needs a resolved edible preparation or recipe result.                                     | No                          |

The engine evaluates supported portions for each `COMPARABLE` entry and
selects one validated portion per ranked food or recipe. It orders **every**
comparable entry by the versioned objective hierarchy and deterministic
tie-break keys. The remaining classes follow in stable classification,
reason, and identity order, with their class displayed rather than a
nutritional suitability rank. User-declared inventory is an availability gate
only when `AVAILABLE_ONLY` is active. Recipe availability requires sufficient
verified quantity for every required ingredient at its versioned yield.

A `READY` first item means highest-ranked among evaluated comparable entries
under the frozen policy. It is a general-wellness planning estimate. Foods
with incomplete evidence remain discoverable through their classification.

The `free-next-meal-weighted-distance-v1` policy scores source-backed temporal
comparisons with known recorded-meal composition. A short available history
can enter the score through a policy-permitted provisional comparison; its
applied span and qualification remain frozen with the run. Each rule supplies its own UTC window,
coverage, reference target, unit, weight, and exact accepted-meal observations.
The input builder evaluates the full eligible rule set in the active release
against comparable catalog and recorded-intake evidence. Foods with incomplete
required composition retain their evidence-limited classification.
For each supported portion, the engine minimizes the sum of weighted,
normalized target distances using exact rational arithmetic. A `minimum`
target has zero distance after it is met; a `preferred` target measures distance
on either side. Verified hard limits already restrict supported portions. Equal
scores use the smallest maximum rule distance, then the smaller edible portion,
source identity, and portion identity. Unresolved historical evidence moves an
otherwise comparable entry to `EVIDENCE_LIMITED` when no policy-permitted
comparison remains. The independent reviewer reconstructs the full census, safety
gates, supported portions, exact score components, and total order from the
frozen input without calling the ranking or classification implementation.
It approves only a complete, matching ranking. A rejected review carries
typed mismatch reasons and supplies no publishable explanations. For each
approved row, explanation facts identify the candidate and portion, applied
temporal rule, comparison window, reference release, accepted meal IDs, and
exact recorded, projected, and normalized amounts. Evidence-limited and
excluded rows retain classification reasons without a numeric suitability
claim. The browser integration publishes and persists only independently
approved rankings, the cited temporal-policy snapshot and applied rule spans,
keeps selection separate, and links actual consumption to the meal ledger. The
planner shows a run-level summary of the recorded-intake assumption, active
nutrient count, provisional-history count, request time, and expiry. Each ranked
candidate exposes its relative order and combined target gap, followed by
per-nutrient recorded and projected amounts, target, normalized gap, weight, applied
and configured history windows, linked accepted meals, reference and horizon
citations, and food-composition provenance. The gap is identified as a ranking
comparison rather than a health score. Historical runs retain these frozen
explanations after expiry. The initial active release uses documented
nutrition-day references. A tested
multi-day policy path accepts separately sourced horizons when such a release
is published. Measured device-envelope sign-off remains a conformance task.

## Typed outcome

`NextMealOutcome` is a strict discriminated union on `status`. Each outcome
carries the matching request/run IDs, input fingerprint, status reason codes,
catalog coverage, policy versions, and completion instant. Published
candidate rows carry their source/portion snapshots, classification, stable
ordering keys, material score components, source-backed explanation facts,
and independent validation evidence.

| Status         | Required meaning and payload                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `READY`        | Full manifest census; every entry classified; every comparable entry ranked and independently validated; `processed = total`; complete ranking and result hash.             |
| `PARTIAL`      | A validated, explicitly incomplete view with processed/total counts, missing scope, and termination reason. Its visible order applies only to processed comparable entries. |
| `NEEDS_INPUT`  | A material user-resolvable fact or required local asset is missing; exact input/asset reason codes identify the next action.                                                |
| `INFEASIBLE`   | A complete census and verified hard rules establish that no candidate is eligible; proof and conflict reasons identify the basis.                                           |
| `SEARCH_LIMIT` | The active resource envelope ended before a publishable complete or validated partial view; limit and observed coverage are recorded.                                       |
| `OUT_OF_SCOPE` | Eligibility policy places the request outside the product's intended use; safe reason codes are provided.                                                                   |
| `CANCELLED`    | User or application cancellation ended the run; progress and cause are retained for diagnostics.                                                                            |
| `ERROR`        | A typed internal or source-integrity failure; safe diagnostic codes and affected scope are retained.                                                                        |

`PARTIAL`, `SEARCH_LIMIT`, and `CANCELLED` carry no complete-catalog or
globally first-ranked claim. A worker limit may yield `PARTIAL` when its
processed subset passes independent validation; otherwise it yields
`SEARCH_LIMIT`. A missing catalog installation yields `NEEDS_INPUT` when the
user can install the required asset. An incomplete asset within an otherwise
available manifest yields `PARTIAL` when a validated subset exists, with
explicit missing scope. Sparse food composition yields `EVIDENCE_LIMITED`,
rather than `INFEASIBLE`.

## Cross-field invariants

1. Request, run, outcome, user-record, and inventory owners match. Exact
   referenced revisions and release digests resolve to the frozen snapshot.
2. Catalog `total` equals the manifest census. Classified counts sum to
   `processed`; `READY` has `processed = total` and zero unprocessed entries.
3. Every processed catalog entry has one unique `candidateKey` and exactly one
   primary classification. Every `COMPARABLE` entry appears exactly once in
   the ranked sequence with a source-backed, in-bounds edible portion.
4. The ranked sequence uses the policy's total ordering and stable tie-break
   keys. Identical frozen inputs and policy versions produce identical hashes.
5. Verified exclusions, source-backed hard limits, and inventory availability
   gate scoring. Missing safety-sensitive evidence routes to a limited class.
6. The independent validator recomputes hard comparisons, portion arithmetic,
   catalog coverage, ordering, and every material numeric explanation claim.
7. A cached outcome is current only while profile, restriction, meal,
   inventory, food/recipe, catalog, reference, temporal, and policy revisions
   match its frozen input and its time validity window remains open. An older
   run remains historical.

## Run, replay, and user commands

`NextMealRun` retains the immutable input fingerprint, catalog manifest and
content digests, engine/policy/source versions, coverage and termination trace,
typed outcome, output hash, independent validation report, and the minimum
candidate/portion facts needed to interpret a selected recommendation after
reference-cache eviction. Its canonical record envelope binds the run ID and
owner. Hashes use canonical JSON and SHA-256 under the shared canonical model.
The local Free policy expires a recommendation after 15 minutes, at the
nutrition-day boundary, or when a recorded meal leaves an active elapsed-time
window, whichever comes first. The exact UTC expiry is frozen with the run and
recomputed during replay. A time-expired run stays readable as history; the
application requires a new run before selection or consumption. One run can
lead to at most one recorded eating occasion, including after the user revises
their selection.
Portable export includes user-owned run records and required replay evidence;
reference releases remain identified by immutable manifest and digest.

`SelectNextMeal` references a `READY` run and one validated ranked candidate,
then creates or revises an intention. `LogAsEaten` separately confirms the
actual food or recipe revision, edible amount, and consumption instant through
the consumption ledger. It may link to an intention while preserving the
actual consumed facts. A fresh ranking is requested after material intake or
context changes. Selection and logging are application commands, rather than
implicit effects of an engine result.

## Contract verification

The Stage 4 conformance suite must cover strict schema parsing; duplicate or
missing catalog identities; deterministic ties; complete versus partial
coverage; every outcome status; unknown nutrient and time-window facts;
source-scoped upper limits; inventory quantity and recipe-ingredient matching;
independent validation failures; stale revisions; cancellation; offline
replay; export/import integrity; and identical hashes for identical snapshots.
The acceptance corpus fixes the published catalog and reference-device
envelope before performance sign-off.
