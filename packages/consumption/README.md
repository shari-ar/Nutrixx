# Consumption

Storage-neutral, append-only intake ledger for manual meal capture and
correction.

## Responsibilities

- Record consumed Food Knowledge or Recipe Knowledge versions with practical
  quantity and edible gram weight.
- Preserve catalog release, local civil date, IANA time zone, display snapshot,
  preparation state, and source provenance.
- Apply corrections as complete immutable revisions linked to their predecessor.
- Update a versioned meal head and publish a domain event in one atomic
  authority-local transaction.
- Exclude voided meals from current projections while retaining full history.

## Boundary

Consumption owns meal facts and corrections. Food and recipe definitions remain
in their owning modules, while Nutrition State consumes committed events and
calculates downstream state. Manual capture has no entitlement or product-quota
dependency.

See [`src/README.md`](src/README.md) for the source map.
