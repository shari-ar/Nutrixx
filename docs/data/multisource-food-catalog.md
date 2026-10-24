# Multi-source food catalog

| Field         | Value                                |
| ------------- | ------------------------------------ |
| Status        | Integrated local reference release   |
| Release       | `food-catalog-us-ca-au-uk-fr-2026.1` |
| Owner         | Nutrixx Data                         |
| Last reviewed | 2026-10-21                           |

## Source order and numeric lineage

The active release combines the existing USDA FoodData Central catalog, Canadian Nutrient File 2026, Australian Food Composition Database Release 3, the United Kingdom's CoFID 2021, and France's Ciqual 2025. A future Nutrixx-reviewed claim enters through the existing reference proposal, review, replay, and publication workflow. Each known numeric observation carries its own source ID, source record ID, source nutrient identity, provider, dataset, release, and retrieval time. Ciqual observations also retain the native confidence code and a reference to the underlying cited source. The food-detail view displays that observation-level origin.

The merge keeps each known USDA food-component value. A Canadian value fills a gap only when the CNF USDA NDB crosswalk identifies one matching USDA food, and the nutrient code maps unambiguously to one Nutrixx component with a compatible unit. An Australian value fills a gap in a USDA food only when the AFCD record explicitly cites one FDC ID and is marked as borrowed. All other Canadian and Australian foods receive separate food identities. Distinct foods retain their own numeric observations, so the source order expresses gap-filling priority rather than a claim that similarly named foods are equivalent.

The food-source preference is USDA, then CNF, then AFCD, then CoFID, then Ciqual. For foods linked by an exact source identifier, the USDA food remains the catalog identity, and a lower-priority source supplies only a still-missing compatible component. Among equally relevant food-search matches, the same source order determines display order. Exact or reviewed identity links establish equivalent foods; independently identified foods stay separate even when their names match.

CoFID foods receive independent identities because the official workbook supplies CoFID food codes without an exact USDA crosswalk. The integration maps 54 source columns with exact component and unit meanings. CoFID values marked `Tr` or `N` remain unquantified; numeric zeroes retain their published value. The 31 alcoholic-beverage rows use a per-100-ml basis and remain outside the per-100-g catalog. The source workbook reuses code `13-669` for two distinct foods; the source row number disambiguates their identities. The source's available-carbohydrate, retinol-equivalent, total-vitamin-E, and vitamin-K1 columns remain separate from broader Nutrixx components with different meanings.

Ciqual foods receive independent identities keyed by their official food codes. The integration maps 48 source constituents with compatible definitions and units. Published numeric zeroes remain measured values. Missing values, traces, and bounded values remain unquantified. The official XML provides a native A–D confidence code and an underlying citation code per constituent; the catalog stores each distinct citation once and links applicable observations to it. Ciqual available carbohydrate, retinol equivalents, and vitamin K fractions remain distinct from the broader registry concepts. The native DFE folate constituent maps to Nutrixx DFE folate.

CNF assumed-zero and low-confidence source codes are excluded from this integration. AFCD zero values are excluded because the published profiles mix measured and imputed zeros with a shared representation. An explicit known zero from reviewed Nutrixx evidence remains supported by the reference proposal contract. AFCD kilojoules are converted to kilocalories using `1 kcal = 4.184 kJ`; compatible mass units are converted explicitly. Unknown values remain unknown wherever the sources supply no usable observation.

## Coverage comparison

The comparison measures known food-component pairs across the 112 recognized components. Its original-food column keeps the same 8,156 USDA foods in the denominator, making the effect of gap filling directly comparable. The whole-catalog column also includes newly added foods.

| Stage            |  Foods | Known pairs | Whole-catalog coverage | Original-food coverage |
| ---------------- | -----: | ----------: | ---------------------: | ---------------------: |
| USDA baseline    |  8,156 |     417,229 |                 45.68% |                 45.68% |
| + CNF 2026       | 10,215 |     509,998 |                 44.58% |                 46.06% |
| + AFCD Release 3 | 11,750 |     560,303 |                 42.58% |                 46.07% |
| + CoFID 2021     | 14,606 |     664,109 |                 40.60% |                 46.07% |
| + Ciqual 2025    | 18,090 |     767,275 |                 37.87% |                 46.07% |

The integration adds 350,046 known pairs. Whole-catalog coverage reaches 37.87% because 9,934 distinct foods expand the denominator faster than their nutrient coverage expands the numerator. The original USDA-food coverage reaches 46.07%. The internal Data Quality Radar continues to expose the remaining gaps; its food-composition queue can prioritize subsequent Nutrixx-reviewed completion work.

## Reproduction and delivery

The source material comes from the [USDA FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/), [Canadian Nutrient File open data](https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109), [AFCD Release 3 data files](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files), the [CoFID 2021 workbook and guide](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid), and the [official Ciqual 2025 workbook and XML files](https://zenodo.org/records/17550133). Cite the fifth dataset as “Anses. 2025. Ciqual French food composition table.” The integration report in the ignored reference workbench records input SHA-256 hashes, source-specific exclusions, component coverage, and the released artifact SHA-256. `scripts/extract-afcd-release.py`, `scripts/extract-cofid-2021.py`, and `scripts/extract-ciqual-2025.py` extract keyed source rows; `scripts/build-multisource-food-catalog.mjs` merges and audits the sources. `packages/food-knowledge/verify-food-catalog-release.mjs` verifies the compressed artifact against its receipt.

The active-catalog descriptor pins the release ID, compressed byte length, SHA-256 digest, and delivery URLs. DevContainer preparation downloads and verifies the published artifact and receipt. The documentation deployment copies the same verified release into the site's `/catalog/` path for same-origin browser installation. Generated source files and releases remain outside Git history.
