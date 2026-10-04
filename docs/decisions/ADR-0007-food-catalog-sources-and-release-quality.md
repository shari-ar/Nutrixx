# ADR-0007: Food catalog sources and release quality

| Field                      | Value                                                  |
| -------------------------- | ------------------------------------------------------ |
| Status                     | Accepted                                               |
| Date                       | 2026-10-04                                             |
| Deciders                   | Product, Data, Nutrition Science, Legal, Quality       |
| Owner                      | Nutrixx Data                                           |
| Related requirements       | FR-003, FR-004, FR-011, FR-015; QR-004, QR-013, QR-015 |
| Resolves                   | OD-003                                                 |
| Supersedes / superseded by | None                                                   |

## Context and problem

Stage 2 requires an internationally useful local food catalog with explicit
portions, preparation states, nutrient observations, provenance, and regional
discovery. Food databases differ materially in license, analytical quality,
nutrient coverage, update behavior, identity semantics, and redistribution
rights. Source admission therefore requires legal, scientific, and technical
evidence in one reproducible release process.

## Decision drivers

- Ship a legally redistributable first catalog with self-contained local use.
- Preserve value-level provenance, preparation state, basis, and missingness.
- Support global locales, scripts, cuisines, household measures, and markets.
- Keep source replacement possible through adapters and immutable releases.
- Fit the active normalized release within the browser-storage policy.
- Apply one scientific and legal gate to every source addition.

## Considered options

1. Aggregate publicly reachable databases, followed by later rights review.
2. Use one international database as the permanent catalog.
3. Use a tiered, license-first source portfolio with a conservative CC0 first
   release and explicit admission gates for regional or reciprocal-license data.
4. Start with a crowdsourced catalog, followed by retrospective validation.

## Decision

Adopt option 3.

### First catalog release

The first published catalog uses the latest acquired releases of these USDA
FoodData Central data types:

| Source                   | First-release role                                     | License treatment |
| ------------------------ | ------------------------------------------------------ | ----------------- |
| Foundation Foods         | Primary analytical foods with detailed source evidence | CC0; cite USDA    |
| SR Legacy, final release | Breadth for established generic foods                  | CC0; cite USDA    |

The ingestion pipeline uses versioned downloadable artifacts and keeps provider
credentials in controlled pipeline environments. It records the upstream
release date, artifact URL, SHA-256 digest, acquisition time, source identifiers,
and CC0 declaration. The raw artifact remains immutable pipeline evidence; the
browser receives the normalized, validated product release.

FNDDS and Branded Foods enter a later admission cycle after their size, identity
patterns, survey or label semantics, update behavior, and browser budget receive
dedicated evidence. Canonical Nutrixx identifiers remain provider-neutral and
retain source identifiers as provenance.

### Reciprocal-license and image sources

Open Food Facts remains in the candidate registry for a future admission cycle.
Its ODbL database, DbCL contents, and CC BY-SA product images require written
Legal approval, attribution and share-alike architecture, source isolation, and
distribution evidence. Product-image admission uses its own rights assessment.

Every published source carries a stored license manifest covering acquisition,
transformation, redistribution, commercial use, and retention. Public
accessibility serves as discovery evidence; the approved manifest grants
publication eligibility.

### International coverage

Stage 2 provides global usability through:

- locale-tagged display names, native-script names, search aliases, and
  household portion terms, stored separately from nutrient observations;
- exact mapping to an accepted source food when identity, edible basis, and
  preparation state are materially equivalent;
- mixed dishes represented as versioned recipes with explicit ingredients,
  yield, and derived-value lineage;
- unlimited local custom foods and recipes with user-entered or label-derived
  provenance and an explicit evidence tier;
- a guided custom-entry path for every unresolved catalog search.

Before Stage 2 exits, versioned coverage corpora represent each launch locale
and a shared global core. Every locale corpus contains at least 100
high-frequency concepts across staples; breads and grains; dairy and
alternatives; meat, poultry, fish, and alternatives; legumes; vegetables and
herbs; fruit and nuts; fats; condiments; beverages; packaged foods; and mixed
dishes. At least 95% resolve to an exact accepted food or an explicit versioned
recipe. Every remaining concept reaches the guided custom-entry path. Approximate
substitution requires explicit user selection and preserves its evidence label.

A regional source earns admission through verified reuse rights, stable source
identifiers, food and preparation descriptions, nutrient definitions and units,
value bases, methods or value origin, release metadata, and documented
missingness semantics.

### Release cadence

- Check upstream release metadata monthly while the active pointer remains
  stable.
- Acquire and quarantine a newly detected eligible release within seven days;
  target activation within 30 days after all gates pass.
- Publish an immutable Nutrixx release when normalized facts or governed
  metadata change.
- Review license terms annually and after every provider announcement.
- Route confirmed corruption or incompatible rights to immediate deactivation,
  restore the last accepted pointer, and apply the full gate to corrections.
- Preserve historical release identifiers for reproducible meals and recipes.

### Blocking quality threshold

Every candidate release satisfies all of the following:

| Gate                   | Acceptance threshold                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Rights                 | 100% of included source artifacts carry an approved license manifest; zero incompatible-use findings   |
| Traceability           | 100% of foods, portions, and nutrient values resolve to source, release, source ID, basis, and mapping |
| Structural validity    | Zero unidentified units/bases, non-finite values, canonical ID collisions, or broken relationships     |
| Missingness            | Zero conversions of absent, unknown, trace, or inapplicable values into measured zero                  |
| Mapping reconciliation | 100% of source records receive an included, deferred, or quarantined disposition with a reason         |
| Scientific regression  | 100% of approved golden fixtures pass their versioned tolerances; zero blocker-severity drift          |
| International workflow | At least 95% exact food/recipe resolution per locale corpus; explicit consent for approximate matches  |
| Reproducibility        | A clean rebuild produces the same manifest, normalized record counts, and release hash                 |
| Browser delivery       | Install, integrity, rollback, and storage-headroom tests pass under ADR-0006                           |

Each food receives a completeness profile by nutrient group. Missing nutrients
retain their explicit state. Similar-food inference, cross-preparation copying,
and analytical synthesis require a separately governed derivation method.
Later nutrition and planning stages apply eligibility rules before calculation.

Outliers enter quarantine with a reason. Identity resolution uses governed
evidence beyond name equality. Every derivation, including recipe calculation
and unit normalization, retains its method and input lineage.

## Consequences

### Benefits

- Stage 2 begins with a legally clear, reproducible catalog.
- Launch locales receive measurable coverage through one international model.
- Missing data and regional gaps remain visible and correctable.
- Additional sources join through stable canonical contracts.
- Browser clients operate with provider-independent release artifacts.

### Costs and trade-offs

- The first release provides focused generic-food coverage.
- Locale corpora, aliases, portions, and recipes require expert review.
- Reciprocal-license sources require dedicated compliance architecture.
- Validation and review define the source-update lead time.

## Validation and review triggers

Stage 2 exit requires the first catalog release, global-core corpus, and every
launch-locale corpus to pass all blocking gates. Food, portion, recipe, and
correction golden cases remain reproducible offline.

Review this ADR for each proposed provider, launch locale, rights-model change,
product-image source, browser-budget change, or provider change to license,
schema, identifiers, and release policy.

## References

- [USDA FoodData Central API guide and CC0 declaration](https://fdc.nal.usda.gov/api-guide/)
- [USDA FoodData Central downloadable releases](https://fdc.nal.usda.gov/download-datasets/)
- [USDA FoodData Central data documentation](https://fdc.nal.usda.gov/data-documentation/)
- [Open Food Facts reuse licenses](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/)
- [FAO/INFOODS mission and quality role](https://www.fao.org/food-composition/infoods/en)
- [FAO/INFOODS food-composition table directory](https://www.fao.org/infoods/infoods/tables-and-databases/en/)
