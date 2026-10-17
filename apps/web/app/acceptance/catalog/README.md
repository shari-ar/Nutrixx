# Development catalog fixture

`route.ts` serves the exact pinned local catalog bytes to the Stage 4 browser
measurement page under a development-only route. The acceptance check verifies
the immutable SHA-256 digest before using those bytes.
