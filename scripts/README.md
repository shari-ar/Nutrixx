# Repository scripts

Small, cross-platform automation used by contributors and CI.

## Contents

| File                                    | Responsibility                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-doc-language.mjs`                | Enforces international scope and affirmative language across technical documentation                                                                      |
| `check-readmes.mjs`                     | Enforces README presence in project-owned directories                                                                                                     |
| `check-agent-curation-assets.mjs`       | Verifies the agent prompt checksum and browser-only upload workflow against the local routes                                                              |
| `local-catalog-draft.mjs`               | Owns the identity-bearing local curation session, immutable base pointer, mutable draft revisions, and browser preview descriptor                         |
| `create-agent-curation-packet.mjs`      | Resolves supplied food names against the active work queue and emits the two-file agent research packet                                                   |
| `create-agent-curation-packet.test.mjs` | Covers exact alias resolution, task construction, and ambiguous-name rejection                                                                            |
| `install-git-hooks.mjs`                 | Installs Husky only in eligible local Git checkouts; skips CI and production contexts                                                                     |
| `run-with-node-env.mjs`                 | Runs a command with an explicit, cross-platform Node environment                                                                                          |
| `data-quality-radar.mjs`                | Audits the installed food catalog and creates an internal, local HTML and JSON quality dashboard                                                          |
| `render-reference-work-queue.mjs`       | Renders the internal food-composition coverage queue with searchable, paginated details                                                                   |
| `render-food-identity-review.mjs`       | Renders the separate nonblocking list of ambiguous source-food identities                                                                                 |
| `stage-reference-data.mjs`              | Stages local source evidence and validated proposals in the ignored reference workbench                                                                   |
| `stage-reference-data.test.mjs`         | Exercises content-addressed staging and quarantine with a synthetic catalog                                                                               |
| `build-reference-candidate.mjs`         | Verifies reviewed evidence, replays the next-meal engine, and writes an inactive candidate                                                                |
| `build-reference-candidate.test.mjs`    | Exercises deterministic replay, reviewer separation, and evidence tampering with a synthetic catalog                                                      |
| `publish-reference-candidate.mjs`       | Revalidates replay, materializes a catalog release, and switches the Web descriptor only on explicit activation                                           |
| `process-agent-curation.mjs`            | Validates every agent claim against the session base and atomically advances a verified local draft plus provenance receipt                               |
| `process-agent-curation.test.mjs`       | Proves multi-batch draft accumulation and automatic fallback supersession by a later external value                                                       |
| `run-agent-curation-worker.mjs`         | Serializes catalog builds, prepares package output, persists lifecycle failures, and invokes the agent-curation processor                                 |
| `stage-4-browser-runner.mjs`            | Measures full-catalog worker responsiveness in a named browser/device; the optional `local` argument runs an isolated IndexedDB create-and-reload journey |
| `build-usda-cooking-tables.py`          | Builds pinned cooking tables and an exact FDC-to-NDB crosswalk from USDA Release 6, Release 2, and SR Legacy files with Python's standard library         |
| `extract-afcd-release.py`               | Extracts keyed AFCD Release 3 workbook rows and source file digests for the multi-source catalog build                                                    |
| `extract-cofid-2021.py`                 | Extracts aligned CoFID 2021 workbook rows, disambiguates duplicate source codes, and records the source digest                                            |
| `extract-ciqual-2025.py`                | Extracts English Ciqual 2025 food identities, XML constituents, native confidence codes, citations, and input digests                                     |
| `food-identity-links.json`              | Declares source priority, reviewed exact identities, and unresolved identity decisions                                                                    |
| `build-multisource-food-catalog.mjs`    | Integrates all declared sources, creates source-independent canonical food identities, and emits lineage, identity-review, and quality artifacts          |
| `verify-active-catalog-assets.mjs`      | Confirms that delivery assets match the pinned active-catalog descriptor and receipt                                                                      |

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
opens the searchable work list. The queue page accepts a names text/JSON file
and downloads a validated `agent-task-packet.json` directly; the local server
does not retain either file. A neighboring link downloads the canonical
`agent-prompt.md` from its tracked source. Generated outputs stay in ignored
local storage and remain outside the public website. Audit logic lives in
`@nutrixx/food-knowledge`; queue logic lives in `@nutrixx/reference-quality`.
An optional local aggregate of distinct consumers from consented recorded meals
can be supplied with `npm run quality:data -- --consumption-snapshot <json-path>`.
The [reference completion contract](../docs/data/reference-completion.md)
defines the snapshot format and tie-break order. Without it, coverage remains
the queue order and no popularity claim is made.

Run `npm run reference:agent:packet -- --names-file <text-or-json-file>` after
the radar is current. The input may be a UTF-8 text file with one food name per
line or a JSON array of names. The command resolves exact catalog identities,
rejects ambiguous names, and writes `agent-prompt.md` plus
`agent-task-packet.json` under `.temp/agent-curation-packets/`. Food names may
also be passed as quoted positional arguments. Optional `--agent-id` and
`--model` values pin the receiving agent identity in the output contract.
The browser workflow at `http://localhost:3002/queue` uses this same generator
and active queue rather than maintaining a second packet format.
The same page submits a completed agent result to the token-protected local
curation API and follows the asynchronous run. A successful run validates the
batch against the session's immutable base, advances the ignored local draft,
refreshes the Radar and work queue from that draft, and reloads the queue page.
All packets created during the session remain pinned to the same base while
new packets use the latest draft's remaining-gap queue. Development Compose enables the endpoint
and shares an automatically generated workspace token between API and Radar
through the ignored `.temp/local-curation-token` file. An explicit
`NUTRIXX_CURATION_TOKEN` remains available as an operator override.

Successful Agent runs remain local and can accumulate without changing tracked
claims or the deployment pointer. While the workbench is active, the Web
dashboard polls the ignored runtime draft descriptor, automatically verifies
and activates every new revision, and labels it `Using Local Draft`. The Reference Work
Queue publishes only after an operator confirms `Release current catalog`.
Configure a local fine-grained `NUTRIXX_GITHUB_TOKEN` with repository Contents
write access, or place the token in `.temp/local-github-token`. The publisher
verifies the exact locally tested artifact and receipt, uploads both through a
draft GitHub Release, publishes only after both uploads succeed, promotes the
local claims and deployment descriptor, and closes the local session. The
published artifact retains the SHA-256 tested in the browser. Publication never
retries HTTP 403.
The pre-push publication-boundary check rejects a committed local draft and
requires curated claims plus their published descriptor to travel in the same
push. Ordinary code changes can therefore ship while an unfinished catalog
draft stays safely in the local working tree.

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
describes the CNF, AFCD, CoFID, and Ciqual match rules, exclusions, provenance, quality
comparison, and delivery. The integration scripts operate on locally supplied
source files and produce ignored workbench artifacts. The verified compressed
release is published separately from Git source history.
