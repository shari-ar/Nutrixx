# Architecture documentation

| Field         | Value                                      |
| ------------- | ------------------------------------------ |
| Status        | Target-state index                         |
| Audience      | Engineering, product, security, operations |
| Owner         | Nutrixx Architecture                       |
| Last reviewed | 2026-09-22                                 |

| Document                                                | View                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| [Target architecture](target-architecture.md)           | Goals, C4 context/containers, deployment, and strategy |
| [Domain boundaries](domain-boundaries.md)               | Ownership and allowed dependencies                     |
| [Quality scenarios](quality-scenarios.md)               | Measurable architectural requirements                  |
| [Risks and technical debt](risks-and-technical-debt.md) | Material risks, mitigations, and trigger points        |
| [Decision records](../decisions/README.md)              | Immutable architectural decisions                      |

Architecture follows [arc42](https://docs.arc42.org/) concerns and uses the
[C4 model](https://c4model.com/diagrams) for views. Context and Container views
are mandatory; deeper component diagrams are added only when they answer a real
design question.

Diagrams MUST keep editable source and identify system boundaries, external
systems, relationship direction, ownership, and trust/data boundaries where
relevant. Accepted decisions are superseded, never silently rewritten.
