# Critical workflows

| Field         | Value                            |
| ------------- | -------------------------------- |
| Status        | Proposed target state            |
| Audience      | Product, engineering, quality    |
| Owner         | Nutrixx Product and Architecture |
| Last reviewed | 2026-10-12                       |

## Responsibility model

| User is responsible for                                                                                   | Nutrixx is responsible for                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Reporting foods, quantities, corrections, preferences, and optional observations as honestly as practical | Search, normalization, unit conversion, nutrient math, provenance, uncertainty, target selection, validation, and explanation |
| Confirming ambiguous matches when the distinction materially changes a result                             | Avoiding unnecessary questions and explaining why a critical question is needed                                               |
| Choosing whether to create a cloud account or share optional health/integration data                      | Local use without account, informed consent, isolation, retention, deletion, and safe handling                                |
| Keeping a local export when browser-only data is important to them                                        | Visible storage status, export/import, persistence guidance, and verified cloud migration                                     |
| Choosing among safe alternatives and seeking professional care when directed                              | Staying inside intended use and refusing unsafe or unsupported conclusions                                                    |

## Progressive onboarding

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant Eligibility
    participant LocalStore
    User->>Web: Accept required terms and enter minimal facts
    Web->>Eligibility: Evaluate product scope locally
    alt Safe and sufficient
        Eligibility-->>Web: READY + optional improvements
        Web->>LocalStore: Persist canonical local profile
        Web-->>User: Start logging; account remains optional
    else Critical fact missing
        Eligibility-->>Web: NEEDS_INPUT + reason
        Web-->>User: Ask one material question
    else Outside intended use
        Eligibility-->>Web: OUT_OF_SCOPE + safe guidance
        Web-->>User: Explain limitation and escalation
    end
```

The workflow is storage-neutral: in `LOCAL`, the browser transaction is
canonical; in `CLOUD`, the equivalent command is authorized and committed by
the API. The eligibility rule and result contract are identical.

## Meal logging and daily state

1. The user selects or creates a food/recipe and provides a practical quantity.
2. Nutrixx resolves portion, preparation, edible basis, and source version.
3. The user confirms only material ambiguity.
4. Consumption stores the event and publishes MealRecorded.
5. Nutrition State incrementally aggregates known nutrients, completeness, and
   uncertainty against applicable targets.
6. The UI shows known results and limitations; missing values retain an explicit
   unknown state distinct from zero.

Manual meal and recipe entry has no product quota in any plan. AI-assisted
capture is an optional draft-producing path documented in
[AI-assisted capture](../engines/ai-assisted-capture.md).

## Free next-meal planning

```mermaid
flowchart LR
    A[Planning request] --> B{Eligibility}
    B -->|out of scope| X[Safe limitation]
    B -->|critical data missing| Q[Request minimal input]
    B -->|ready| C[Immutable next-meal context]
    C --> D[Classify full local catalog]
    D --> E[Apply hard rules and optional inventory]
    E --> F[Evaluate evidence-qualified portions]
    F --> G[Rank comparable eligible entries]
    G --> H[Independent validation and freshness check]
    H -->|pass| I[Show ranked options and coverage]
    H -->|requires review| R[Show limited status and reason]
    I --> J[User chooses an option]
    J --> K[Confirm actual meal and amount]
    K --> L[Record consumed meal]
```

The engine uses applicable recorded-intake history at each source-backed
temporal horizon. The user can browse the complete classified catalog and
choose any eligible option. Selection creates a revisable intention;
consumption becomes authoritative only after explicit confirmation of the
actual food, amount, and time. An optional user-enabled inventory mode limits
recommendations to declared available foods and recipe ingredients. Every
published ranking reports complete or partial coverage and its evidence
limits. See [the Free planning decisions](../decisions/README.md) and
[optimizer engine](../engines/optimizer.md).

## Data publication

Source acquisition → license check → quarantine → schema validation → canonical
mapping → unit and identity checks → deduplication → quality report → human
approval where required → immutable release → canary evaluation → activation.

Activation and rollback are separate from ingestion. Historical calculations
keep the release version originally used.

## Storage-mode changes

Upgrade and downgrade are first-class data-integrity workflows coordinated with
payment state. They use staged copy, manifest verification, a single authority
switch, recovery evidence, and delayed source cleanup. See
[Storage-mode lifecycle](storage-mode-lifecycle.md).

## Hosted AI action

```mermaid
flowchart LR
    A[Critical user input] --> V[Validate eligibility and entitlement]
    V --> R[Reserve one allowance unit]
    R --> G[Generate and validate typed draft]
    G -->|technical failure| X[Release reservation]
    G -->|complete result shown| C[Consume reservation]
    C --> U{User decision}
    U -->|confirm or edit| S[Owning domain validates and saves]
    U -->|reject| D[Discard draft]
```

Showing a complete usable result consumes the allowance even if the user later
rejects it. Technical failure releases it. Retrying the same failed action uses
the same idempotency identity. No draft becomes a fact before confirmation.
