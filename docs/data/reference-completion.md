# Reference-data completion contract

| Field         | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| Status        | Implemented intake, replay, guarded publication, and site delivery |
| Audience      | Data engineering, nutrition science, quality                       |
| Owner         | Nutrixx Data                                                       |
| Last reviewed | 2026-10-24                                                         |

## Purpose and boundary

The [reference-quality package](https://github.com/shari-ar/Nutrixx/tree/main/packages/reference-quality)
defines one gap identity and prioritization policy across food composition,
cooking nutrient retention, cooking weight yield, and intake references. The
current increments contain the pure priority contract, a food-composition
coverage queue built from the pinned local catalog, local proposal intake,
an inactive candidate builder with next-meal calculation replay, and a
guarded food-catalog publication path. The active Web descriptor selects the
[verified multi-source catalog](./multisource-food-catalog.md); future
Nutrixx-reviewed claims enter through the same publication path.

A gap is an observation about a pinned reference artifact. Its stable key
contains the domain subject and deficiency, while the detected release ID and
SHA-256 digest retain the observation's exact source state. A later release can
resolve the same gap while retaining its identity. An observed zero is a
known value with complete evidence for its food-component pair.

| Field        | Meaning                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `subject`    | Exact food and component, food and cooking method, or component, reference type, source scope, population, and market |
| `deficiency` | Incomplete coverage, absent, explicitly unknown, unit-incompatible, or missing lineage                                |
| `detectedIn` | Pinned release ID and artifact digest that exposed the gap                                                            |
| `impact`     | Optional replay evidence from a fixed, SHA-256-identified case corpus                                                 |
| `safety`     | Routine, or a critical concern with rationale and evidence ID                                                         |

## Priority policy

All measured gaps in one ranking MUST use the same corpus ID and digest.
`affectedCases` counts cases whose decision evidence is limited by the gap;
`blockedCases` counts the subset where the engine abstains from a recommendation.
`evaluatedCases` is the common denominator. The contract validates
`0 <= blockedCases <= affectedCases <= evaluatedCases` and requires a positive
denominator.

For measured gaps, priority policy `reference-gap-priority-v1` calculates:

```text
score = round(70 * blockedCases / evaluatedCases
            + 30 * affectedCases / evaluatedCases)
```

The result is an integer from 0 to 100. Critical concerns with a documented
rationale and evidence ID form the first band. Other measured gaps follow in
descending score; gaps without replay evidence form an explicit unmeasured
band. Stable gap keys break ties. A measured zero and missing measurements have
different meanings. The score expresses decision-coverage impact in the fixed
corpus; scientific confidence, source readiness, implementation effort, and
health risk remain separate assessments.

For example, a potato composition gap that affects 80 of 100 cases and blocks
20 scores 38. An eggplant cooking-yield gap that affects 40 and blocks 2 scores 13. This order is a property of the measured corpus, rather than a claim about
all users or an inferred nutrient value.

## Current work queue

The internal [Data Quality Radar](https://github.com/shari-ar/Nutrixx/blob/main/scripts/README.md) links to a local,
searchable queue for the active food catalog. Each candidate identifies a
latest food revision, its source record, and exact absent, explicitly unknown,
and unit-incompatible components. An observed zero contributes to known
coverage. When an operator supplies a consented actual-consumption snapshot,
the queue first presents foods consumed by more distinct users. Equal counts
use the existing order: missing components mapped to the adult baseline target
set, then total missing components. With no snapshot, the same coverage order
applies and the interface explicitly marks consumption evidence as unavailable.
Current recorded meal facts from production users are the sole basis for
consumption counts. Searches, views, proposed meals, test data, and voided meals
remain separate activity types. The snapshot aggregates current recorded meal
facts; each user counts at most once per food during its stated period. Free-mode
browser records remain local. Sharing usage statistics requires explicit
opt-in. The queue output includes aggregate counts and period metadata;
user identifiers and meal records stay in the protected source system. This
order supports coverage triage and carries an explicit `unmeasured`
decision-impact status. Cooking retention, cooking yield, and intake reference
work items enter the queue after their domain-specific inventories
have been validated; comparable replay evidence will then support an impact
ranking.

The optional local input is
`npm run quality:data -- --consumption-snapshot path/to/snapshot.json`.
Its JSON shape is:

```json
{
  "format": "nutrixx.food-consumption-snapshot",
  "schemaVersion": 1,
  "catalogReleaseId": "food-catalog-us-ca-au-uk-fr-2026.3",
  "source": "consented-recorded-meals",
  "periodStartInclusive": "2026-07-01T00:00:00.000Z",
  "periodEndExclusive": "2026-10-01T00:00:00.000Z",
  "foodCounts": [{ "foodId": "catalog-food-id", "uniqueConsumers": 12 }]
}
```

Generate these counts only from explicitly consented users' latest,
non-voided recorded meal facts. Foods absent from the snapshot have zero
observed consumers, rather than an inferred usage estimate. The input must
match the audited catalog release; duplicate, unknown, and invalid counts
fail validation.

## Local proposal intake

`npm run reference:stage -- --source ./reference-workbench/source.pdf --proposal ./reference-workbench/proposal.json`
reads an operator-supplied source file and proposal from local disk. It uses
the installed local catalog; the optional `--catalog` argument selects another
local catalog artifact. This command performs no network request. The
operator obtains source material and checks its usage rights separately.

The proposal records the pinned catalog release ID and artifact SHA-256 from
`/queue.json`, source title, publisher, HTTPS source URL, license ID, edition,
retrieval time, expected raw-file SHA-256, operator ID, extraction time, and
extraction method. Each claim records an exact page, table, row, or equivalent
evidence locator. Supported claim subjects are food composition, cooking
retention, cooking yield, and intake references. A food-composition known zero
is represented as `"amount": "0"` with `"state": "known"`.

For example, the proposal's core shape is:

```json
{
  "format": "nutrixx.reference-proposal",
  "schemaVersion": 1,
  "catalog": {
    "releaseId": "catalog-release-id",
    "artifactSha256": "64 lowercase hexadecimal characters"
  },
  "source": {
    "sourceId": "source-table-2026",
    "title": "Published nutrient table",
    "publisher": "Source authority",
    "sourceUrl": "https://example.org/table",
    "licenseId": "documented-license-id",
    "edition": "2026 edition",
    "retrievedAt": "2026-10-18T00:00:00.000Z",
    "expectedSha256": "64 lowercase hexadecimal characters"
  },
  "extraction": {
    "operatorId": "operator-1",
    "extractedAt": "2026-10-18T01:00:00.000Z",
    "method": "manual-transcription"
  },
  "claims": [
    {
      "kind": "food-composition",
      "foodId": "food-id-from-queue",
      "componentId": "nutrient.protein",
      "value": {
        "state": "known",
        "amount": "0",
        "unit": { "system": "ucum", "code": "g" },
        "basis": "per-100-gram-edible"
      },
      "locator": "Page 3, table 2, row 4"
    }
  ]
}
```

Replace the illustrative identifiers, URLs, and digests with exact evidence
before staging. The CLI validates the raw-source checksum, catalog identity,
food and component IDs, comparable units, retention bounds, positive yield,
target semantics,
evidence locators, and duplicate claim subjects. It copies the exact raw bytes
and proposal to [`reference-workbench/`](https://github.com/shari-ar/Nutrixx/tree/main/reference-workbench)
under content-addressed names. Its `run-*.json` file lists proposed claims
with `pending-review` status and quarantined entries with explicit reasons.
A run with quarantined entries exits with code `2`, while retaining its report.
Scientific interpretation, source licensing, and cooking-method mapping remain
review gates. Staging leaves active reference data and user data unchanged.

## Reviewed candidate and differential replay

`npm run reference:candidate -- --run ./reference-workbench/run-<digest>.json --review ./reference-workbench/review.json --corpus ./reference-workbench/corpus.json`
builds an inactive, immutable candidate from local files. The command reads
the pinned catalog, original evidence bytes, staged proposal, independent
review, and fixed replay corpus. It performs no network request. The reviewer
must differ from the extractor. Every staged claim receives exactly one
accepted or rejected decision with a rationale. Acceptance records positive
checks for source evidence, usage rights, and units or cooking method.

The review file has this shape:

```json
{
  "format": "nutrixx.reference-review",
  "schemaVersion": 1,
  "runId": "64 lowercase hexadecimal characters",
  "reviewerId": "independent-reviewer",
  "reviewedAt": "2026-10-18T02:00:00.000Z",
  "decisions": [
    {
      "claimKey": "exact key from the staged run",
      "disposition": "accepted",
      "rationale": "Checked the source row, license, value, and unit.",
      "checks": {
        "sourceEvidence": true,
        "usageRights": true,
        "unitsAndMethod": true
      }
    }
  ]
}
```

The replay corpus identifies 1–100 frozen next-meal ranking requests. Each
case has a stable `caseId` and a `request` in the
`NextMealRankingRequestSchema` shape. Its outer object uses
`"format": "nutrixx.reference-replay-corpus"`, `"schemaVersion": 1`, a
stable `corpusId`, and a `cases` array. Each food entry in a request refers
to the pinned, latest catalog revision.

The builder fills food nutrient facts from the actual catalog for the baseline
run and from the reviewed food-composition overlay for the candidate run.
Both runs use the production next-meal ranking engine and its independent
ranking reviewer. The replay report records the fixed corpus digest, before
and after result digests, first-choice changes, comparable counts, and
evidence-limited counts. Every accepted food-composition claim must appear in
at least one case. An increase in evidence-limited candidates, a decrease in
comparable candidates, an uncovered claim, or an unsupported claim kind sets
the candidate status to `BLOCKED` for inspection.

The content-addressed `projection-*.json` is an indexed, calculation-ready
overlay on the immutable base catalog. It contains source and review
provenance for accepted food-composition values and separate sections for
cooking retention, cooking yield, and intake references. `replay-*.json`
contains the differential audit, and `candidate-*.json` pins both artifact
digests, byte lengths, base catalog, review run, and inactive state. These
files remain in the ignored local workbench. A candidate with `REPLAYED`
status has passed this corpus, rather than a universal scientific validation.
Cooking and intake claims remain explicitly `BLOCKED` until domain-specific
replay adapters can evaluate their effects on a next-meal request.

## Publication and site activation

`npm run reference:publish -- --run <run.json> --review <review.json> --corpus <corpus.json>`
revalidates staged evidence and replay before materializing a standard,
immutable food-catalog release in `.temp/reference-publication/`. Accepted
food-composition observations replace the affected component observation in
the catalog. Unchanged observations remain intact. The receipt records
source and reviewer lineage. Publication requires `REPLAYED` status; cooking
and intake claims await domain-specific replay and publication adapters.

The command writes a compressed catalog, receipt, and active-release
descriptor to its local output directory. Delivery infrastructure serves
the catalog and receipt at immutable HTTPS URLs. Once those exact assets are
available, add `--activate --artifact-url <https-url> --receipt-url <https-url>`
to the command. Activation copies verified release assets into
`apps/web/public/catalog/` and switches the tracked
`apps/web/config/active-food-catalog.json` descriptor last. The DevContainer
retrieves the pinned active release when its local artifact is absent.

The dashboard offers local installation or an update action. Before browser
activation, it checks compressed byte length, SHA-256, and the release's
internal manifest and payload digests. Food, meal, nutrition, and next-meal
consumers then share the same active catalog through the reference cache.
Previously recorded references retain their release ID. The internal Data
Quality Radar audits the descriptor-selected release and presents its
candidate ID, reviewed claim count, current coverage, and updated work queue.
Operator source files and replay cases stay in the ignored local workbench.

## Agent-native Nutrixx fallback completion

Nutrixx-curated food-composition values use a separate machine-first path.
An agent submits one batch containing up to 5,000 independently attributable
claims to `POST /api/v1/internal/curation/runs` with the local bearer token.
The API returns `202 Accepted` immediately. The caller polls the returned
`statusUrl` until the run is `completed` or `failed`.

Each claim targets one exact food ID, revision, preparation state, component,
unit, and per-100-gram edible basis. Every value carries its own evidence
passport. `external-source` identifies any reported dataset, article, website,
book, label, or other source with its title and locator plus every available
publisher, URL, edition, license, retrieval, and digest field.
`model-knowledge` explicitly records that the model supplied the value from its
existing knowledge. `agent-derived` records a calculation, evidence synthesis,
or estimation, preserves its derivation, and attributes its material inputs.
The system assigns the evidence tier from this type. Invalid claims enter the
run quarantine independently; valid claims in the same batch keep processing.
Duplicate claim IDs and duplicate food-component targets in one batch enter
quarantine.

The processor updates the canonical
`reference-data/nutrixx-curated/claims.v1.json` input and builds an immutable,
locally active catalog artifact plus a receipt and report under the ignored run
directory.
The receipt connects every projected observation to its agent identity,
instruction digest, and evidence passport. Git history audits canonical claim
changes; generated artifacts remain outside Git and enter delivery through the
normal immutable release path.

Nutrixx-curated is a permanent fallback class rather than a numbered provider.
Every external provider, including one added later, outranks it. A curated
claim remains in canonical data while the compiler omits it from the active
projection whenever an external known value exists for the same exact cell.
This makes external supersession automatic and reversible without losing the
Nutrixx evidence record. The Data Quality Radar can guide agent work, while
batch order remains independent from radar priority.

The development Compose stack enables the local endpoint and protects it with
`Authorization: Bearer <workspace-token>`. The API creates a 256-bit token in
the ignored `.temp/local-curation-token` file when an explicit
`NUTRIXX_CURATION_TOKEN` override is absent. A successful run has
`publicationState: local-draft`. The processor validates the batch against the
session's immutable base and atomically advances an identity-bearing draft
revision after the build succeeds. Draft claims, session state, and the browser
preview pointer stay in ignored local storage. Immutable remote hosting proceeds
through the explicit delivery workflow.
Production keeps the endpoint disabled unless its operator supplies an explicit
configuration.

The packet generator accepts exact food names either as quoted arguments or as
a UTF-8 text/JSON names file. It resolves each name against the latest draft
work queue, rejects missing or ambiguous identities, and emits two standalone files:
the versioned agent prompt and a catalog-pinned task packet containing exact
food revisions, preparation states, missing components, canonical units, and
the prompt digest. Every packet in one curation session remains pinned to the
same immutable base identity, so completed results can return in any order while
the draft continues to advance. The research agent needs these two files rather than the
repository. Empty `evidenceSources` leaves research unrestricted. The agent may
use any external source, Model Knowledge, or an attributable derivation; every
resulting value still carries its own explicit provenance.

The development-only Reference Work Queue at `http://localhost:3002/queue`
provides the same packet builder without duplicating its resolution rules. The
operator uploads the UTF-8 text/JSON names file and receives
`agent-task-packet.json` directly from the local radar service. The endpoint
holds no upload or packet after the response; it reads the active queue and
canonical prompt digest for each request. A neighboring download link serves
the canonical `agent-prompt.md` directly from its tracked project source. CLI
generation remains available for automation and additionally writes the
canonical prompt beside the packet.

The same queue page accepts the completed
`nutrixx.agent-curation-batch` JSON, submits it through a local same-origin
proxy, and follows its persisted asynchronous run through completion or
failure. The proxy reads the workspace token from the ignored local token file
and keeps it exclusively within the local server path. The API retains the
submitted batch, status, and worker log in the ignored local run directory for
the latest-run report. The queue page presents accepted and rejected claim
counts together with the comparable-cell coverage before and after a completed
run, and keeps the persisted latest result visible after a page reload.

Agent runs remain local drafts regardless of how many batches accumulate. The
Web dashboard polls the ignored runtime draft pointer, automatically verifies
and activates every new revision, and displays `Using Local Draft` while that
revision is active in the local reference cache. The tracked claims and deployment
descriptor remain unchanged throughout the session. The
Reference Work Queue exposes one explicit `Release current catalog` action.
That action verifies the exact tested draft artifact and receipt, creates or resumes a
draft GitHub Release, uploads both immutable assets, publishes the Release only
after both assets succeed, promotes the local claims, records immutable HTTPS
URLs in the tracked active descriptor, and closes the local session. The
published artifact retains the browser-tested SHA-256. A local fine-grained GitHub token with repository Contents
write access stays exclusively in the Radar server environment. HTTP 403 stops
publication immediately without retry. No Agent upload triggers publication.
The queue page is the sole interactive operator workflow for batch submission
and explicit catalog release.

## Completion workflow

1. The operator audits each pinned reference release and produces gap records.
2. A fixed cross-domain replay corpus measures decision coverage for each gap.
3. The internal work queue presents impact, safety evidence, source readiness,
   and estimated effort as distinct fields.
4. Accepted source observations retain license, unit, method, lineage, and
   review evidence before entering a release candidate.
5. Validation and differential replay produce an immutable reference release
   and a calculation-ready projection.
6. The internal radar measures the remaining gaps after activation.

Raw acquisition files and operator work records remain in controlled local
work storage. Reviewed small reference rules belong to their domain package;
large published artifacts belong to immutable release storage. The browser
receives an optimized, re-downloadable reference cache that remains separate
from user-authority records and user exports.
