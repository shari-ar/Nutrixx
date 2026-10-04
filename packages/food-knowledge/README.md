# Food Knowledge

Storage-neutral domain models and application services for immutable food
catalog releases.

## Responsibilities

- Represent food identities, revisions, localized descriptions, preparation
  states, portions, composition observations, and source provenance.
- Preserve measured zero independently from unknown composition.
- Validate catalog referential integrity and release-level quality metadata.
- Build integrity-protected reference releases for the shared reference cache.
- Provide deterministic, locale-aware local search and food-detail queries.

## Boundary

This package contains domain contracts, pure application logic, and the
operator command that normalizes approved raw source releases. Source download
remains an explicit operator action outside the package.
Canonical user facts remain in the user-authority repository, while published
food catalogs remain in the disposable reference-release cache.

See [`src/README.md`](src/README.md) for the source map.

## Building the first source release

After building this workspace, generate the integrity-protected compressed
catalog from the official extracted JSON files:

```sh
npm run catalog:build:usda --workspace=@nutrixx/food-knowledge -- \
  <foundation.json> <sr-legacy.json> <output-directory>
```

The command creates a compressed reference release and a small receipt with
source counts, quarantine counts, coverage, and SHA-256 digests. Generated
catalog artifacts belong in release storage outside the Git repository.

Verify the decompressed schema, release metadata, byte length, and both
integrity digests before publishing an artifact:

```sh
npm run catalog:verify --workspace=@nutrixx/food-knowledge -- \
  <catalog.json.gz> <receipt.json>
```
