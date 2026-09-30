# PostgreSQL persistence adapter

Implements the canonical repository contract with PostgreSQL transactions. In
Stage 1 this adapter is a conformance probe only; it does not enable cloud data
authority or hosted product behavior.

Run the integration contract with `TEST_DATABASE_URL` set to an isolated test
database and `npm run test:contract --workspace=@nutrixx/persistence-postgresql`.
