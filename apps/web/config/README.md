# Web static configuration

Typed, non-secret configuration that describes Web presentation such as product
metadata, navigation, and external links.

`mock-data.ts` is a temporary exception containing presentation-only sample
meals for the product skeleton. Remove it when Stage 1 introduces the real
local data source; it must never become a second domain model.

## Rules

- Runtime environment parsing belongs in `@nutrixx/config/environment`.
- Secrets and deployment-specific values must never be committed here.
- Export immutable typed values with names that describe their consumer.
- Keep business rules and API response data out of static configuration.
