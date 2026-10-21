# Repository scripts

Small, cross-platform automation used by contributors and CI.

## Contents

| File                                 | Responsibility                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-doc-language.mjs`             | Enforces international scope and affirmative language across technical documentation                                                                      |
| `check-readmes.mjs`                  | Enforces README presence in project-owned directories                                                                                                     |
| `install-git-hooks.mjs`              | Installs Husky only in eligible local Git checkouts; skips CI and production contexts                                                                     |
| `run-with-node-env.mjs`              | Runs a command with an explicit, cross-platform Node environment                                                                                          |
| `data-quality-radar.mjs`             | Audits the installed food catalog and creates an internal, local HTML and JSON quality dashboard                                                          |
| `render-reference-work-queue.mjs`    | Renders the internal food-composition coverage queue with searchable, paginated details                                                                   |
| `stage-reference-data.mjs`           | Stages local source evidence and validated proposals in the ignored reference workbench                                                                   |
| `stage-reference-data.test.mjs`      | Exercises content-addressed staging and quarantine with a synthetic catalog                                                                               |
| `build-reference-candidate.mjs`      | Verifies reviewed evidence, replays the next-meal engine, and writes an inactive candidate                                                                |
| `build-reference-candidate.test.mjs` | Exercises deterministic replay, reviewer separation, and evidence tampering with a synthetic catalog                                                      |
| `publish-reference-candidate.mjs`    | Revalidates replay, materializes a catalog release, and switches the Web descriptor only on explicit activation                                           |
| `stage-4-browser-runner.mjs`         | Measures full-catalog worker responsiveness in a named browser/device; the optional `local` argument runs an isolated IndexedDB create-and-reload journey |
| `build-usda-cooking-tables.py`       | Builds pinned cooking tables and an exact FDC-to-NDB crosswalk from USDA Release 6, Release 2, and SR Legacy files with Python's standard library         |
| `extract-afcd-release.py`            | Extracts keyed AFCD Release 3 workbook rows and source file digests for the multi-source catalog build                                                    |
| `build-multisource-food-catalog.mjs` | Integrates USDA, CNF 2026, and AFCD Release 3 with observation-level lineage and a before/after quality report                                            |
| `verify-active-catalog-assets.mjs`   | Confirms that delivery assets match the pinned active-catalog descriptor and receipt                                                                      |

## Rules

- Prefer Node.js standard-library scripts for Windows/Linux parity.
- Make scripts non-interactive, deterministic, idempotent, and fail-fast.
- Resolve paths from the script or repository root, never the caller's machine.
- Print actionable errors and use non-zero exit codes on policy failures.
- Keep business logic in packages and deployment logic in infrastructure tooling.

Run `npm run quality:data` inside the DevContainer to audit the installed catalog.
The script reads the local release without downloading it and writes the internal
dashboard to `.temp/data-quality-radar/index.html` and the food-composition
work queue to `queue.html` and `queue.json` in the same directory. Open the
dashboard through the forwarded Dev Container port `3002`; its queue link
opens the searchable work list. Generated outputs stay in ignored local
storage and remain outside the public website. Audit logic lives in
`@nutrixx/food-knowledge`; queue logic lives in `@nutrixx/reference-quality`.
An optional local aggregate of distinct consumers from consented recorded meals
can be supplied with `npm run quality:data -- --consumption-snapshot <json-path>`.
The [reference completion contract](../docs/data/reference-completion.md)
defines the snapshot format and tie-break order. Without it, coverage remains
the queue order and no popularity claim is made.

Run `npm run reference:stage -- --source <local-file> --proposal <proposal.json>`
to stage operator-provided evidence without a download or active-data change.
The [reference completion contract](../docs/data/reference-completion.md)
defines the proposal fields and review boundary.

Run `npm run reference:candidate -- --run <run.json> --review <review.json> --corpus <corpus.json>`
after independent review. The command uses the installed local catalog and
writes an immutable, inactive projection, differential replay report, and
candidate manifest to the local workbench. The reference completion contract
defines the review and replay file shapes and blocked-candidate criteria.

Run `npm run reference:publish -- --run <run.json> --review <review.json> --corpus <corpus.json>`
to produce an immutable reviewed catalog, receipt, and activation descriptor
in `.temp/reference-publication/`. Once the exact files are available at
immutable HTTPS URLs, add `--activate --artifact-url <https-url>
--receipt-url <https-url>` to install the release in the Web catalog directory
and switch its tracked descriptor. The internal radar then audits the active
release. Artifact hosting is a separate delivery step.

For a source refresh, obtain USDA `retn06.txt` (Release 6) and
`USDA_CookingYields_MeatPoultry02.xlsx` (Release 2) from the URLs in
`apps/web/lib/usda-cooking.ts`, plus the SR Legacy April 2018 JSON from
[FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/).
Run `python scripts/build-usda-cooking-tables.py <retention.txt> <yields.xlsx> <sr-legacy.json>`.
The generated JSON records SHA-256 hashes for all three source files.
`apps/web/lib/usda-ah102-curated.json` is separately audited against the
[USDA Agriculture Handbook 102 PDF](https://www.ars.usda.gov/SP2UserFiles/Place/80400525/Data/Classics/ah102.pdf)
and requires page, item, and raw-food NDB evidence for each added row.

The [multi-source catalog contract](../docs/data/multisource-food-catalog.md)
describes the CNF and AFCD match rules, exclusions, provenance, quality
comparison, and delivery. The integration scripts operate on locally supplied
source files and produce ignored workbench artifacts. The verified compressed
release is published separately from Git source history.
