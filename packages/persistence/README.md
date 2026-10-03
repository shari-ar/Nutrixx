# Persistence contract

Storage-neutral repository, atomic-command, and transaction-log contracts plus
the reusable conformance suite for canonical Nutrixx records. Runtime adapters
implement this package; domain code must not depend on adapter-specific APIs.

The `testing` export is test-only. It runs identical behavioral assertions
against every adapter factory.

An atomic repository commits all mutations and one ordered log entry together.
`commandId` receipts make exact retries idempotent and reject divergent reuse.
