# Multi-source food catalog

| Field         | Value                                |
| ------------- | ------------------------------------ |
| Status        | Integrated local reference release   |
| Release       | `food-catalog-us-ca-au-uk-fr-2026.2` |
| Owner         | Nutrixx Data                         |
| Last reviewed | 2026-10-24                           |

## Source order and numeric lineage

The active release combines the existing USDA FoodData Central catalog, Canadian Nutrient File 2026, Australian Food Composition Database Release 3, the United Kingdom's CoFID 2021, and France's Ciqual 2025. A future Nutrixx-reviewed claim enters through the existing reference proposal, review, replay, and publication workflow. Each known numeric observation carries its own source ID, source record ID, source nutrient identity, provider, dataset, release, and retrieval time. Ciqual observations also retain the native confidence code and a reference to the underlying cited source. The food-detail view displays that observation-level origin.

The merge keeps each known USDA food-component value. A Canadian value fills a gap when the CNF USDA NDB crosswalk identifies one matching USDA food, or when a reviewed identity group identifies the same food. An Australian value fills a gap when an AFCD record explicitly cites one FDC ID and is marked as borrowed, or when a reviewed identity group identifies the same food. Nutrient concepts and units must also map unambiguously. Other source records retain independent food identities.

The food-source preference is USDA, then CNF, then AFCD, then CoFID, then Ciqual. For linked source records, the highest-priority available food remains the catalog identity, and each lower-priority source supplies only a still-missing compatible component. The selected numeric value retains its own source record, nutrient code, and citation. The food record also lists linked source records and the basis of each link. Among equally relevant search matches, the source order determines display order.

## Reviewed food identities

`scripts/food-identity-links.json` records 66 reviewed food-form groups and 167 source identities using native record IDs and exact source descriptions. Its initial scope covers distinct, single-food forms such as fresh basil, raw watercress, and raw chicken breast with meat and skin. A build validates each source ID, source description, unique provider membership, and priority order. Existing official CNF and AFCD identifier links take precedence, and any conflicting reviewed link fails the build. Records outside these evidence-backed groups retain independent identities. The build report records each stage's linked-food count, the reviewed group totals, and the resulting component coverage.

CoFID foods use reviewed identity links where available; the remaining source records have independent identities. The integration maps 54 source columns with exact component and unit meanings. CoFID values marked `Tr` or `N` remain unquantified; numeric zeroes retain their published value. The 31 alcoholic-beverage rows use a per-100-ml basis and remain outside the per-100-g catalog. The source workbook reuses code `13-669` for two distinct foods; the source row number disambiguates their identities. The source's available-carbohydrate, retinol-equivalent, total-vitamin-E, and vitamin-K1 columns remain separate from broader Nutrixx components with different meanings.

Ciqual foods use reviewed identity links where available; the remaining source records retain identities keyed by their official food codes. The integration maps 48 source constituents with compatible definitions and units. Published numeric zeroes remain measured values. Missing values, traces, and bounded values remain unquantified. The official XML provides a native A–D confidence code and an underlying citation code per constituent; the catalog stores each distinct citation once and links applicable observations to it. Ciqual available carbohydrate, retinol equivalents, and vitamin K fractions remain distinct from the broader registry concepts. The native DFE folate constituent maps to Nutrixx DFE folate.

CNF assumed-zero and low-confidence source codes are excluded from this integration. AFCD zero values are excluded because the published profiles mix measured and imputed zeros with a shared representation. An explicit known zero from reviewed Nutrixx evidence remains supported by the reference proposal contract. AFCD kilojoules are converted to kilocalories using `1 kcal = 4.184 kJ`; compatible mass units are converted explicitly. Unknown values remain unknown wherever the sources supply no usable observation.

## Coverage comparison

The comparison measures known food-component pairs across the 112 recognized components. Its original-food column keeps the same 8,156 USDA foods in the denominator, making the effect of gap filling directly comparable. The whole-catalog column also includes newly added foods.

| Stage            |  Foods | Known pairs | Whole-catalog coverage | Original-food coverage |
| ---------------- | -----: | ----------: | ---------------------: | ---------------------: |
| USDA baseline    |  8,156 |     417,229 |                 45.68% |                 45.68% |
| + CNF 2026       | 10,215 |     509,998 |                 44.58% |                 46.06% |
| + AFCD Release 3 | 11,743 |     560,128 |                 42.59% |                 46.08% |
| + CoFID 2021     | 14,571 |     663,187 |                 40.64% |                 46.09% |
| + Ciqual 2025    | 18,006 |     764,935 |                 37.93% |                 46.10% |

The integration adds 347,706 known pairs. Whole-catalog coverage reaches 37.93% across 18,006 distinct foods. Reviewed identity linking consolidates 84 duplicate source records and adds 283 known nutrient pairs to the original USDA foods compared with the preceding five-source release. Original USDA-food coverage reaches 46.10%. The internal Data Quality Radar continues to expose remaining gaps; its food-composition queue can prioritize subsequent Nutrixx-reviewed completion work.

## Reproduction and delivery

The source material comes from the [USDA FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/), [Canadian Nutrient File open data](https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109), [AFCD Release 3 data files](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files), the [CoFID 2021 workbook and guide](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid), and the [official Ciqual 2025 workbook and XML files](https://zenodo.org/records/17550133). Cite the fifth dataset as “Anses. 2025. Ciqual French food composition table.” The integration report in the ignored reference workbench records input SHA-256 hashes, source-specific exclusions, component coverage, and the released artifact SHA-256. `scripts/extract-afcd-release.py`, `scripts/extract-cofid-2021.py`, and `scripts/extract-ciqual-2025.py` extract keyed source rows; `scripts/build-multisource-food-catalog.mjs` merges and audits the sources. `packages/food-knowledge/verify-food-catalog-release.mjs` verifies the compressed artifact against its receipt.

The active-catalog descriptor pins the release ID, compressed byte length, SHA-256 digest, and delivery URLs. DevContainer preparation downloads and verifies the published artifact and receipt. The documentation deployment copies the same verified release into the site's `/catalog/` path for same-origin browser installation. Generated source files and releases remain outside Git history.
