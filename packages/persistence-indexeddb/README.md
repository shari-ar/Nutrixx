# IndexedDB persistence adapter

Implements the canonical repository and atomic transaction-log contracts with
native IndexedDB APIs. Canonical records, the ordered log, and idempotency
receipts share one strict read-write transaction.

Versioned exports are validated before an all-or-nothing replacement import;
record state, transaction history, and idempotency receipts are restored in one
strict transaction. Immutable reference releases use a separate disposable
IndexedDB database, so cache eviction or clearing cannot remove user data.

The adapter accepts an `IDBFactory`, which keeps browser ownership explicit and
allows the same code to run against `fake-indexeddb` in conformance, rollback,
interruption, and schema-runner tests. The pre-release schema runner installs
only baseline version `1`; every unsupported transition fails closed.
