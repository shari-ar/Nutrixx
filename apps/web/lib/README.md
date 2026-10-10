# Web runtime services

This directory contains browser-only service boundaries used by client
components. Services may coordinate approved Web Platform APIs and Nutrixx
adapters, but they must not contain presentation code or silently transmit
local-authority data.

`browser-storage.ts` is the single web boundary for storage status,
user-initiated persistence, verified export download, and explicit local-data
clearing.

`browser-onboarding.ts` owns the one-time starting profile. `browser-stage-two.ts`
owns verified catalog installation and the local custom-food, recipe, and meal
workflows. Both remain browser-only and use the shared canonical repository.
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
