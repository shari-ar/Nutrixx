# Data publication and quality

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Status        | Guarded food-composition publication implemented; broader target state |
| Audience      | Data engineering, nutrition science, security, operations              |
| Owner         | Nutrixx Data                                                           |
| Last reviewed | 2026-10-25                                                             |

## Pipeline

```mermaid
flowchart LR
    A[Acquire + license manifest] --> B[Immutable raw artifact]
    B --> C[Quarantine and malware/schema checks]
    C --> D[Map identities, units, bases]
    D --> E[Validate and deduplicate]
    E --> F[Quality and coverage report]
    F --> G{Approval gate}
    G -->|reject| Q[Quarantine with reasons]
    G -->|approve| H[Immutable release candidate]
    H --> I[Regression and canary evaluation]
    I -->|pass| J[Activate pointer]
    I -->|fail| K[Retain previous release]
    J --> L[Impact analysis / recomputation jobs]
```

Ingestion writes to quarantined release candidates. Activation updates a version
pointer; rollback selects the previous accepted release.

The [reference completion contract](reference-completion.md) documents the
implemented local review, differential replay, immutable catalog publication,
and single Web activation descriptor. The initial descriptor selects the
verified USDA release while operator-reviewed data is being prepared.

Food identity admission uses a separate deterministic lane. Exact normalized
identities merge automatically into a source-independent canonical ID. Explicit
preparation and edible-part differences remain distinct. Ambiguous source
records enter the nonblocking Food Identity Review list and stay outside the
candidate artifact until an agent records a decision. Candidate publication
continues with every admitted record, and provider additions, removals, and
priority changes preserve existing canonical IDs.

## Release manifest

Each release contains:

- source artifacts, checksums, provider revisions, and license/use constraints;
- canonical schema and mapping versions;
- included/excluded record counts and rejection reasons;
- identity merge/split decisions;
- unit, range, dimensional, and duplicate validation results;
- coverage by nutrient, food category, cuisine/market, and preparation state;
- comparison against the previous release;
- reviewer approvals, timestamps, and release hash.

## Blocking checks

Activation requires resolution of every blocking condition:

- an unknown or incompatible unit/basis in a published quantity;
- a canonical ID collision among admitted records;
- missing source version or incompatible license;
- an impossible/unsafe range according to an accepted validation rule;
- a regression beyond the approved threshold;
- a missing lineage path for a calculated value;
- unreviewed changes to eligibility, target, or upper-limit semantics.

Ambiguous identities enter Food Identity Review with explicit reasons. Other
outliers use the domain-specific staging lane. Corrections create a new release.

## Change impact

Before activation, the pipeline samples or replays representative meals,
recipes, nutrition states, and optimizer cases. It reports changed outputs and
whether the change crosses user-visible or safety thresholds.

Historical snapshots preserve their original release IDs. Recalculation creates
new snapshots while preserving prior evidence.

## Accepted source policy

The [reference completion contract](reference-completion.md) identifies and
prioritizes gaps across food composition, cooking rules, and intake references
before an operator begins source acquisition. Its decision-coverage score and
source-quality checks serve different purposes.

[ADR-0007](../decisions/ADR-0007-food-catalog-sources-and-release-quality.md)
is authoritative for provider admission, licenses, international coverage,
release cadence, and blocking thresholds. The first catalog release normalizes
USDA FoodData Central Foundation Foods and SR Legacy under CC0.

The active catalog exposes regional gaps, preserves missing nutrient states,
labels user-selected approximate substitutions, and publishes each source with
an approved license manifest and reproducible release evidence.
