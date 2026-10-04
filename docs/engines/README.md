# Domain engine documentation

| Field         | Value                                           |
| ------------- | ----------------------------------------------- |
| Status        | Target-state index                              |
| Audience      | Engine, application, quality, nutrition science |
| Owner         | Nutrixx Domain Engineering                      |
| Last reviewed | 2026-09-27                                      |

| Document                                                | Purpose                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| [Health context](health-context.md)                     | Safe derivation of non-diagnostic context                    |
| [Daily nutrition state](daily-nutrition-state.md)       | Intake aggregation and target comparison                     |
| [Optimizer](optimizer.md)                               | Feasibility, objectives, prediction, validation, explanation |
| [AI-assisted capture](ai-assisted-capture.md)           | Safe hosted and user-enabled local draft generation          |
| [Conversational assistant](conversational-assistant.md) | Ultimate tool-mediated, grounded conversation                |

Engines are deterministic, framework-free, side-effect-free packages. Callers
resolve immutable inputs before invocation and persist immutable outputs after
invocation. Adapters handle databases, networks, environment variables, and
user-facing prose.

The AI documents describe orchestration adapters around the deterministic
core as supporting capabilities. Model output remains a candidate until it
passes typed validation, domain policy, and required user confirmation.

Common execution contract:

```text
validated typed inputs + explicit versions
→ pure calculation
→ typed result | typed refusal/diagnostics
→ independent invariant validation
→ immutable fingerprinted snapshot
```
