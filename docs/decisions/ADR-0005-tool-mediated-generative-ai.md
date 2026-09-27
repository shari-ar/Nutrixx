# ADR-0005: Generative AI is tool-mediated and non-authoritative

| Field                      | Value                                             |
| -------------------------- | ------------------------------------------------- |
| Status                     | Proposed                                          |
| Date                       | 2026-09-27                                        |
| Deciders                   | Product, Architecture, Nutrition Science, Security |
| Owner                      | Nutrixx AI Engineering                            |
| Related requirements       | FR-018–FR-020; QR-003, QR-016; QS-01, QS-16       |
| Supersedes / superseded by | None                                              |

## Context and problem

Generative AI can reduce entry effort and support conversation, but it is
non-deterministic, prompt-injectable, provider-dependent, and capable of
inventing facts. Nutrixx guidance requires replayable nutrition arithmetic,
policy enforcement, authorization, and safety validation.

## Decision drivers

- Low-friction input and useful natural-language interaction.
- No model authority over facts, calculations, safety, or writes.
- Provider/model portability and bounded cost.
- Traceable, consent-scoped use of sensitive context.

## Considered options

1. Give the model direct database and network access.
2. Let the model calculate and publish plans end to end.
3. Use the model only behind typed, allowlisted, least-privilege tools and
   deterministic validation.

## Decision

Adopt option 3. AI output is untrusted. Capture AI creates reviewable drafts.
The Ultimate assistant proposes typed tool calls through a trusted orchestrator.
The model has no raw database credentials, unrestricted HTTP, arbitrary code,
or direct write access. Consequential writes require an exact preview and
explicit user confirmation. Arithmetic, targets, eligibility, hard constraints,
and publication validation remain deterministic authorities.

## Consequences

### Positive

- Model/provider replacement does not change domain authority.
- Tool authorization and confirmation are independently testable.
- Hallucinations cannot directly become canonical facts or unsafe plans.
- Local and hosted AI share the same draft/validation boundary.

### Negative / trade-offs

- More orchestration and typed tool design than a free-form chatbot.
- Some model capabilities are intentionally unavailable.
- Evaluation must cover prompt injection, tool misuse, and groundedness.

## Validation and review triggers

Release blocks on unauthorized access, confirmation bypass, unsupported numeric
claims, safety-policy override, unbounded tool loops/cost, sensitive telemetry,
or unsafe prompt-injection success. Any proposal for autonomous consequential
actions requires a superseding ADR and separate safety/privacy approval.

