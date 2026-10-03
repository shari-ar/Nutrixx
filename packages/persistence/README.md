# Persistence contract

Storage-neutral repository, atomic-command, transaction-log, local data
transfer, and reference-cache contracts plus the reusable conformance suite for
canonical Nutrixx records. Runtime adapters implement this package; domain code
must not depend on adapter-specific APIs.

The `testing` export is test-only. It runs identical behavioral assertions
against every adapter factory.

An atomic repository commits all mutations and one ordered log entry together.
`commandId` receipts make exact retries idempotent and reject divergent reuse.

Local export version `1` binds canonical records and their complete transaction
history to a strict manifest and SHA-256 payload digest. Importers validate
structure, versions, record seals, identities, counts, hashes, and full replay
consistency before replacing authority data.

Reference releases are immutable, hash-verified, and disposable. The cache
contract keeps them outside user authority storage and supports activation,
inspection, least-recently-used pruning, and independent clearing.
