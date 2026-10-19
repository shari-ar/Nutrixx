# Web static configuration

Typed, non-secret configuration that describes Web presentation such as product
metadata, navigation, and external links. User facts, meals, recipes, and
catalog data stay in their browser-backed domain adapters rather than static
configuration.

## Rules

- Runtime environment parsing belongs in `@nutrixx/config/environment`.
- Secrets and deployment-specific values must never be committed here.
- Export immutable typed values with names that describe their consumer.
- Keep business rules and API response data out of static configuration.

`active-food-catalog.json` is the tracked deployment pointer for the verified
offline catalog. It pins release identity, compressed size, SHA-256,
reviewed-candidate identity, and immutable delivery URLs. The guarded
publication command changes it after replay and artifact validation.
`active-food-catalog.ts` validates this descriptor during Web builds.
