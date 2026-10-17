# Repository scripts

Small, cross-platform automation used by contributors and CI.

## Contents

| File                           | Responsibility                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-doc-language.mjs`       | Enforces international scope and affirmative language across technical documentation                                                                      |
| `check-readmes.mjs`            | Enforces README presence in project-owned directories                                                                                                     |
| `install-git-hooks.mjs`        | Installs Husky only in eligible local Git checkouts; skips CI and production contexts                                                                     |
| `run-with-node-env.mjs`        | Runs a command with an explicit, cross-platform Node environment                                                                                          |
| `data-quality-radar.mjs`       | Audits the installed food catalog and creates an internal, local HTML and JSON quality dashboard                                                          |
| `stage-4-browser-runner.mjs`   | Measures full-catalog worker responsiveness in a named browser/device; the optional `local` argument runs an isolated IndexedDB create-and-reload journey |
| `build-usda-cooking-tables.py` | Builds pinned cooking tables and an exact FDC-to-NDB crosswalk from USDA Release 6, Release 2, and SR Legacy files with Python's standard library         |

## Rules

- Prefer Node.js standard-library scripts for Windows/Linux parity.
- Make scripts non-interactive, deterministic, idempotent, and fail-fast.
- Resolve paths from the script or repository root, never the caller's machine.
- Print actionable errors and use non-zero exit codes on policy failures.
- Keep business logic in packages and deployment logic in infrastructure tooling.

Run `npm run quality:data` inside the DevContainer to audit the installed catalog.
The script reads the local release without downloading it and writes the internal
dashboard to `.temp/data-quality-radar/index.html`. Open that file in a browser
or editor preview. The generated report is ignored by Git and is not deployed
with the public website. The audit logic and fixtures live in
`@nutrixx/food-knowledge`.

For a source refresh, obtain USDA `retn06.txt` (Release 6) and
`USDA_CookingYields_MeatPoultry02.xlsx` (Release 2) from the URLs in
`apps/web/lib/usda-cooking.ts`, plus the SR Legacy April 2018 JSON from
[FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/).
Run `python scripts/build-usda-cooking-tables.py <retention.txt> <yields.xlsx> <sr-legacy.json>`.
The generated JSON records SHA-256 hashes for all three source files.
`apps/web/lib/usda-ah102-curated.json` is separately audited against the
[USDA Agriculture Handbook 102 PDF](https://www.ars.usda.gov/SP2UserFiles/Place/80400525/Data/Classics/ah102.pdf)
and requires page, item, and raw-food NDB evidence for each added row.
