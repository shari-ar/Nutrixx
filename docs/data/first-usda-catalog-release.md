# First USDA catalog release

| Field         | Value                              |
| ------------- | ---------------------------------- |
| Status        | Implementation evidence            |
| Audience      | Data engineering, quality, product |
| Owner         | Nutrixx Data                       |
| Last reviewed | 2026-10-05                         |

## Release identity

| Field                     | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| Release ID                | `food-catalog-usda-2026-04-30.1`                                   |
| Catalog schema            | `v1`                                                               |
| Published instant         | `2026-10-04T00:00:00.000Z`                                         |
| Source datasets           | USDA FDC Foundation Foods 2026-04-30; USDA FDC SR Legacy 2018-04   |
| Source license            | CC0-1.0                                                            |
| Compressed artifact size  | 29,063,889 bytes                                                   |
| Artifact SHA-256          | `06397f3f38e0b60aed4c677e24224b3f0835f632930fbd8afdab3ef084eaa591` |
| Uncompressed payload size | 329,184,505 bytes                                                  |
| Manifest SHA-256          | `4fbc1ad50d64ae3121bb2e51382633427a3d34dad66bba68c28abc4fc2850f6b` |
| Payload SHA-256           | `5192ed1ee29ab69a4408c253fbb3e2740559f66bcd75fe7be0e2ab6cb19b0dd7` |

## Included facts

| Fact                           | Count    |
| ------------------------------ | -------- |
| Sources                        | 8,156    |
| Foods                          | 8,156    |
| Portions                       | 14,814   |
| Composition observations       | 659,308  |
| Foods with portions            | 95.77%   |
| Foods with composition         | 100%     |
| Known composition observations | 99.9959% |

The normalization pipeline quarantined 32 null source entries, 10 negative
nutrient values, and 18 nonpositive portions. The artifact retains explicit
missingness and source lineage for all published facts.

## Reproducible local build

The generated `.json.gz` artifact and receipt remain outside Git because they
are release outputs. Build and verify them from locally acquired USDA files:

```bash
node packages/food-knowledge/build-usda-release.mjs \
  <foundation.json> <sr-legacy.json> <output-directory>
node packages/food-knowledge/verify-food-catalog-release.mjs \
  <output-directory>/food-catalog-usda-2026-04-30.1.v1.json.gz \
  <output-directory>/food-catalog-usda-2026-04-30.1.receipt.json
```

The Foods route accepts the verified `.json` or `.json.gz` artifact, validates
the manifest and hashes before activation, and keeps the active release in the
reference-data cache rather than the user-data store.

The documentation deployment publishes the approved release at the same-origin
`/catalog/` path. DevContainer startup retrieves that immutable artifact into
the ignored Web runtime directory. A person explicitly installs the artifact
into browser-local reference storage, with visible download and storage impact.

## Evidence boundary

This release provides reproducible technical evidence for source rights,
normalization, structural integrity, and browser installation. Coverage-corpus
review and moderated task-time and assistive-technology evaluation remain
release evidence activities under the Stage 2 acceptance protocol.
