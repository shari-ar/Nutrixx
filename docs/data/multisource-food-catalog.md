# Multi-source food catalog

| Field         | Value                              |
| ------------- | ---------------------------------- |
| Status        | Integrated local reference release |
| Release       | `food-catalog-us-ca-au-2026.1`     |
| Owner         | Nutrixx Data                       |
| Last reviewed | 2026-10-21                         |

## Source order and numeric lineage

The active release combines the existing USDA FoodData Central catalog, Canadian Nutrient File 2026, and Australian Food Composition Database Release 3. A future Nutrixx-reviewed claim enters through the existing reference proposal, review, replay, and publication workflow. Each known numeric observation carries its own source ID, source record ID, source nutrient identity, provider, dataset, release, and retrieval time. The food-detail view displays that observation-level origin.

The merge keeps each known USDA food-component value. A Canadian value fills a gap only when the CNF USDA NDB crosswalk identifies one matching USDA food, and the nutrient code maps unambiguously to one Nutrixx component with a compatible unit. An Australian value fills a gap in a USDA food only when the AFCD record explicitly cites one FDC ID and is marked as borrowed. All other Canadian and Australian foods receive separate food identities. Distinct foods retain their own numeric observations, so the source order expresses gap-filling priority rather than a claim that similarly named foods are equivalent.

CNF assumed-zero and low-confidence source codes are excluded from this integration. AFCD zero values are excluded because the published profiles mix measured and imputed zeros with a shared representation. An explicit known zero from reviewed Nutrixx evidence remains supported by the reference proposal contract. AFCD kilojoules are converted to kilocalories using `1 kcal = 4.184 kJ`; compatible mass units are converted explicitly. Unknown values remain unknown wherever the sources supply no usable observation.

## Coverage comparison

The comparison measures known food-component pairs across the 112 recognized components. Its original-food column keeps the same 8,156 USDA foods in the denominator, making the effect of gap filling directly comparable. The whole-catalog column also includes newly added foods.

| Stage            |  Foods | Known pairs | Whole-catalog coverage | Original-food coverage |
| ---------------- | -----: | ----------: | ---------------------: | ---------------------: |
| USDA baseline    |  8,156 |     417,229 |                 45.68% |                 45.68% |
| + CNF 2026       | 10,215 |     509,998 |                 44.58% |                 46.06% |
| + AFCD Release 3 | 11,750 |     560,303 |                 42.58% |                 46.07% |

The integration adds 143,074 known pairs. Whole-catalog coverage declines because 3,594 distinct foods expand the denominator faster than their nutrient coverage expands the numerator. The internal Data Quality Radar continues to expose the remaining gaps; its food-composition queue can prioritize subsequent Nutrixx-reviewed completion work.

## Reproduction and delivery

The source material comes from the [USDA FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/), [Canadian Nutrient File open data](https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109), and [AFCD Release 3 data files](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files). The integration report in the ignored reference workbench records input SHA-256 hashes, source-specific exclusions, component coverage, and the released artifact SHA-256. `scripts/extract-afcd-release.py` extracts keyed workbook rows; `scripts/build-multisource-food-catalog.mjs` merges and audits the sources. `packages/food-knowledge/verify-food-catalog-release.mjs` verifies the compressed artifact against its receipt.

The active-catalog descriptor pins the release ID, compressed byte length, SHA-256 digest, and delivery URLs. DevContainer preparation downloads and verifies the published artifact and receipt. The documentation deployment copies the same verified release into the site's `/catalog/` path for same-origin browser installation. Generated source files and releases remain outside Git history.
