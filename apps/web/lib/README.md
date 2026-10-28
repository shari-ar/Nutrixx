# Web runtime services

This directory contains browser-only service boundaries used by client
components. Services may coordinate approved Web Platform APIs and Nutrixx
adapters, but they must not contain presentation code or silently transmit
local-authority data.

`browser-storage.ts` is the single web boundary for storage status,
user-initiated persistence, verified export download and restore, and explicit
local-data clearing. Restore checks integrity and the starting profile before
offering an explicit replacement confirmation.

`browser-onboarding.ts` owns the one-time starting profile. `browser-stage-two.ts`
owns verified catalog installation and the local custom-food, recipe, and meal
workflows. Both remain browser-only and use the shared canonical repository.
`local-catalog-draft.ts` validates the development-only runtime draft pointer.
While the development workbench is active, the dashboard polls this pointer,
automatically verifies and activates each new revision, and visibly identifies
the exact local artifact without changing the tracked deployment catalog.
`next-meal-catalog.ts` enumerates the entire active installed food catalog and
current user-food and recipe revisions for next-meal classification. Its sorted
manifest covers every source entry, including entries with incomplete evidence.
The incremental catalog builder reuses the mapped immutable release inside the
short-lived planning worker and remaps only changed custom-food and recipe
revisions. `next-meal-catalog-cache.ts` keeps the verified mapping across page
visits as disposable IndexedDB data, keyed by release and mapping version. A
release change or owner change resets the worker mapping; low storage falls
back to rebuilding it from the authoritative reference release.
`browser-nutrition-state.ts` connects the meal ledger and starting profile to
versioned local daily and rolling calculations. The optional US/Canada
reference-region choice and effective-dated nutrition-day time zone are retained
as canonical user-context records. The device's travel zone is proposed for
user review; only explicit confirmation schedules it at the next boundary.
Starting-profile edits preserve the original zone to keep historical days stable. Meal
corrections refresh derived snapshots; opening Nutrition reconciles them again
from authoritative meal history.
The same service stores the chosen activity category as canonical user context
and exposes the NASEM-based maintenance-energy estimate to the Activity route.
Nutrition snapshot recomputation shares an in-flight request within one store
and holds an exclusive origin-wide Web Lock per subject across tabs. Meal-change
recomputations use the same lock. A secure browser context provides the Web
Locks API used by the supported browser matrix.
`nutrition-context.ts` resolves exact catalog, custom-food, and recipe-version
composition for publication. It preserves unknown values and supports local
recipe and meal nutrition snapshots entirely in the browser.

`usda-cooking.ts` exposes pinned USDA Release 6 nutrient-retention treatments,
Release 2 meat/poultry weight yields, and a small, audited set of Handbook 102
weight yields for legumes, vegetables, and grains. The generated
`usda-ndb-crosswalk.json` maps catalog FDC IDs to SR Legacy NDB numbers; yield
rows match raw-food NDB identity and preparation method. Linked preparation
steps suggest a treatment and yield only when each match is unique. Published
recipes retain each USDA rule and version. A measured final weight supports
recipes without a defensible weight-yield match.

`food-price-examples.ts` adds three illustrative USD-per-100-g prices to exact
foods in the pinned catalog at read time. The verified USDA artifact remains
unchanged; custom foods can store the same optional field in local user data.
The examples are Fuji apple (`$0.4`), fresh whole egg (`$0.6`), and whole milk
without added vitamins (`$0.2`) per 100 g. These values demonstrate the field
as fixed product examples.

`next-meal-input.ts` builds the one-next-meal request from the local catalog,
accepted meals within each cited temporal-rule window, applicable reference
targets, and optional inventory. It applies the versioned temporal-policy
contract, keeps short-history qualification with the frozen run, and uses the
published daily-reference horizon until additional sourced rules are released.
`browser-planning.ts` delegates recommendation creation and saved-run loading
to the browser worker. `browser-planning-core.ts` owns the local recommendation,
selection, data and time freshness, independent review, persistence, and the
explicit actual-consumption handoff to the meal ledger. The core runs inside
the worker for creation and loading. A run expires after 15 minutes or an
earlier applicable temporal boundary. `next-meal-preparation-client.ts` carries
only compact outcomes across the UI boundary during creation. The worker is
reused between requests and released after two idle minutes. The disposable
`next-meal-display-cache.ts` stores a digest-checked UI projection that omits
unranked candidate composition. A canonical transaction, active catalog
release, policy release, or expiry invalidates its fast-load path; canonical
data remains the authority and rebuilds a missing or invalid projection.
`browser-outcome-feedback.ts` stores optional weight and transcribed lab
observations as separate local user-context records. Its descriptive summaries
stay outside the next-meal input and recorded-intake calculation paths.
See the
[Free next-meal contract](../../../docs/engines/next-meal-contract.md).
`next-meal-acceptance-fixture.ts` pins the adult request and catalog digest
shared by the isolated full-catalog Node audit and development-browser
measurement. `next-meal-full-catalog.acceptance.ts` writes a private result to
`.temp/stage-4-acceptance/` when `npm run acceptance:stage4` runs.
