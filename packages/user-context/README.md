# User Context

Storage-neutral contracts and application services for the smallest useful
starting profile and optional user-reported outcome observations.

## Responsibilities

- Capture only age, height, weight, physiological reference, primary goal, and
  optional food restrictions during initial onboarding.
- Preserve adult confirmation, IANA time zone, provenance, and profile revision.
- Save the profile as an integrity-sealed canonical record in the active local
  or cloud authority repository.
- Update one stable profile record without repeating onboarding.
- Record optional dated weight and transcribed lab observations with explicit
  user provenance in separate canonical records.

## Boundary

User Context stores user-provided context. Nutrition Science interprets that
context through separately governed rules. The profile remains general-wellness
input and carries no diagnostic conclusion.
Outcome observations remain descriptive feedback; recorded food intake and
next-meal ranking use their own evidence and policy boundaries.

See [`src/README.md`](src/README.md) for the source map.
