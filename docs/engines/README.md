# Domain engine documentation

| Field         | Value                                           |
| ------------- | ----------------------------------------------- |
| Status        | Target-state index                              |
| Audience      | Engine, application, quality, nutrition science |
| Owner         | Nutrixx Domain Engineering                      |
| Last reviewed | 2026-09-22                                      |

| Document                                          | Purpose                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| [Health context](health-context.md)               | Safe derivation of non-diagnostic context                    |
| [Daily nutrition state](daily-nutrition-state.md) | Intake aggregation and target comparison                     |
| [Optimizer](optimizer.md)                         | Feasibility, objectives, prediction, validation, explanation |

Engines are deterministic, framework-free, side-effect-free packages. Callers
resolve immutable inputs before invocation and persist immutable outputs after
invocation. Engines do not read databases, call networks, inspect environment
variables, or generate unverified prose.

Common execution contract:

```text
validated typed inputs + explicit versions
→ pure calculation
→ typed result | typed refusal/diagnostics
→ independent invariant validation
→ immutable fingerprinted snapshot
```
