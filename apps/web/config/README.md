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
