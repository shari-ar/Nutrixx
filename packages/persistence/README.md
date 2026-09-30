# Persistence contract

Storage-neutral ports, write rules, and the reusable conformance suite for
canonical Nutrixx records. Runtime adapters implement this package; domain code
must not depend on adapter-specific APIs.

The `testing` export is test-only. It runs identical behavioral assertions
against every adapter factory.
