# IndexedDB persistence adapter

Implements the canonical repository contract with native IndexedDB APIs. The
adapter accepts an `IDBFactory`, which keeps browser ownership explicit and
allows the same code to run against `fake-indexeddb` in conformance tests.
