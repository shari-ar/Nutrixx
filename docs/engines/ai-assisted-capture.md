# AI-assisted capture

| Field         | Value                                                |
| ------------- | ---------------------------------------------------- |
| Status        | Proposed target design                               |
| Audience      | Product, AI, application, security, privacy, quality |
| Owner         | Nutrixx AI and Application Engineering               |
| Last reviewed | 2026-09-27                                           |

## Purpose and boundary

AI-assisted capture reduces typing by converting user-provided text, speech,
images, or links into a structured meal or recipe draft. AI is a candidate
generator. Authoritative consumption facts, durable nutrient truth, targets,
and user confirmation remain under typed domain workflows.

```text
minimum critical input
→ entitlement / local-processing selection
→ AI extraction
→ schema validation
→ canonical food, portion, unit and preparation resolution
→ deterministic calculation and material-ambiguity checks
→ reviewable draft
→ user confirmation
→ authoritative save
```

## Hosted execution

Hosted execution is available only through active Pro or Ultimate entitlements.
The server reserves one action after required input passes bounded validation
and immediately before costly execution. A complete result displayed to the
user commits the action. Infrastructure/provider failure releases it. User
rejection retains the successful-computation charge; manual edits are free.

The job is idempotent and records plan, allowance period, action kind, reserved
at, terminal status, provider/model/prompt-policy versions, safe cost metadata,
and result hash. Meal text, images, health context, prompts, and generated
content are prohibited from normal logs and metrics.

See [plans and entitlements](../product/plans-and-entitlements.md) for exact
allowances and reset rules.

## Experimental local execution

Free users MAY explicitly enable `Experimental Local Processing` from Advanced
Settings. Plan marketing excludes this capability, and initialization requires
an explicit user action.

Supported adapters may include:

| Adapter               | Secret/data path                                              | Required disclosure                                                    |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Provider OAuth + PKCE | Browser directly to provider using scoped token               | Provider, scopes, data sent, revocation                                |
| BYOK direct request   | Bearer key and selected input remain in browser/provider path | Website-code access risk, provider terms, session/persistence choice   |
| WebGPU/WASM           | Model and inference stay on device                            | Exact download/storage size, hardware support, cache removal, fallback |

Local processing uses an independent user-enabled pathway. Hosted-AI and
AI-dependent optimizer functions require their own entitlements. It produces the same candidate draft schema
and passes the same deterministic resolver, validator, and confirmation flow.

## Draft contract

An AI draft distinguishes extracted claims from canonical resolutions:

```text
CaptureDraft
├── draft_id + idempotency key
├── action kind: MEAL | RECIPE
├── source modality and user-supplied context
├── extracted items with original spans/regions
├── candidate food/portion/unit/preparation matches
├── per-field confidence or explicit unknown
├── material questions and unsupported claims
├── provider/model/prompt-policy versions
├── expiry and data-residency mode
└── no authoritative meal/recipe identifier before confirmation
```

The system asks only questions that can materially change identity, amount,
nutrition, safety, or recipe yield. Confidence remains metadata. A
missing quantity or uncertain match remains unresolved or is confirmed by the
user; explicit resolution governs every uncertain value.

## Safety and privacy controls

- Input is minimized before external processing; unrelated profile or health
  context is excluded.
- Images, audio, links, retrieved content, provider output, and model tool calls
  are untrusted and bounded by type, size, duration, and content policy.
- Provider egress is allowlisted and purpose-specific. Provider terms,
  retention, training use, and region are reviewed before hosted activation.
- Direct local mode keeps API keys and tokens inside the approved browser
  credential boundary, with redaction across logs, analytics, error reports,
  support artifacts, and server requests.
- CSP, Trusted Types, dependency integrity, output encoding, and egress tests
  reduce browser compromise risk; product disclosure states that origin code
  can exercise a locally available bearer credential.
- Generated numbers and nutrient totals must resolve to deterministic typed
  output before display as Nutrixx calculations.
- A user can inspect, edit, reject, and report a bad draft without losing the
  original manually entered critical facts.

## Evaluation and release gates

Evaluation is stratified by language, script, modality, cuisine, food category,
portion expression, device/browser, and material ambiguity. Required measures
include exact/partial entity match, quantity/unit error, unsafe auto-resolution,
question burden, correction rate, latency, failure/refund correctness, cost per
successful action, and confirmation/rejection. No aggregate score may hide an
unsafe resolution subgroup.
