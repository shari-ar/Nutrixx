# Domain model

| Field         | Value                           |
| ------------- | ------------------------------- |
| Status        | Proposed target model           |
| Audience      | Architecture, engineering, data |
| Owner         | Nutrixx Architecture            |
| Last reviewed | 2026-09-27                      |

## Aggregates and invariants

| Bounded context         | Aggregate roots                                            | Principal invariants                                                                                                               |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Identity & Consent      | Account, ConsentGrant                                      | Consent is purpose-specific, revocable, time-bound where required, and auditable.                                                  |
| User Context            | Profile, GoalSet, ObservationSeries                        | Facts keep effective time, source, unit, and correction history. Eligibility-critical facts cannot be guessed silently.            |
| Food Knowledge          | Food, PortionSet, CompositionRecord                        | Every amount has an explicit basis and provenance. Missing is distinct from measured zero.                                         |
| Recipe Knowledge        | Recipe, RecipeVersion                                      | Published versions are immutable; ingredients resolve to exact versions; yield and edible basis are explicit.                      |
| Consumption             | Meal                                                       | Items preserve the consumed quantity and referenced version known at the event time. User corrections append audit history.        |
| Nutrition Science       | NutrientDefinition, TargetPolicy, RuleSet                  | Definitions and policies are versioned, reviewed, applicable to named populations, and effective-dated.                            |
| Nutrition State         | StateSnapshot                                              | A snapshot records its period, input watermark, engine/rule/data versions, completeness, and uncertainty.                          |
| Planning                | PlanningRequest, OptimizerRun, Plan                        | Only eligible, independently validated results become user-visible. Hard constraints are never silently relaxed.                   |
| Data Publication        | ImportBatch, DatasetRelease                                | Untrusted source records remain quarantined until mapped, validated, licensed, and approved. Published releases are immutable.     |
| Audit & Provenance      | EvidenceTrace                                              | Important decisions can be reconstructed without reading mutable operational tables.                                               |
| Commerce & Entitlements | Subscription, EntitlementGrant, UsageReservation           | Grants are effective-dated and server-authoritative; one action reaches exactly one consumed or released terminal state.           |
| Portability & Sync      | ExportBundle, MigrationSession, SyncCursor                 | Authority switches only after a versioned manifest and all canonical records pass integrity verification.                          |
| AI Orchestration        | CaptureJob, CaptureDraft, AssistantSession, ToolInvocation | Model output is untrusted until schema/policy validation; canonical writes require an owning-domain command and user confirmation. |

## Conceptual relationships

```mermaid
erDiagram
    ACCOUNT ||--o{ CONSENT_GRANT : grants
    ACCOUNT o|--|| USER_PROFILE : optionally_authenticates
    USER_PROFILE ||--o{ USER_OBSERVATION : records
    FOOD ||--o{ FOOD_PORTION : offers
    FOOD ||--o{ COMPOSITION_OBSERVATION : has
    NUTRIENT ||--o{ COMPOSITION_OBSERVATION : identifies
    RECIPE ||--o{ RECIPE_VERSION : versions
    RECIPE_VERSION ||--o{ RECIPE_INGREDIENT : contains
    FOOD ||--o{ RECIPE_INGREDIENT : references
    USER_PROFILE ||--o{ MEAL : logs
    MEAL ||--o{ MEAL_ITEM : contains
    FOOD ||--o{ MEAL_ITEM : captures
    MEAL ||--o{ NUTRITION_STATE : contributes
    TARGET_POLICY ||--o{ NUTRITION_STATE : evaluates
    NUTRITION_STATE ||--o{ OPTIMIZER_RUN : informs
    OPTIMIZER_RUN ||--o{ PLAN : produces
    ACCOUNT ||--o{ ENTITLEMENT_GRANT : receives
    ENTITLEMENT_GRANT ||--o{ USAGE_RESERVATION : governs
    USER_PROFILE ||--o{ MIGRATION_SESSION : migrates
    USER_PROFILE ||--o{ CAPTURE_JOB : requests
    CAPTURE_JOB ||--o| CAPTURE_DRAFT : produces
    USER_PROFILE ||--o{ ASSISTANT_SESSION : opens
    ASSISTANT_SESSION ||--o{ TOOL_INVOCATION : audits
```

The diagram is conceptual: storage may normalize or partition differently.
Cross-context references are opaque identifiers or published value snapshots,
not foreign-key permission to mutate another context.

## Domain events

| Event                                       | Producer                | Typical consumers                                        |
| ------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| MealRecorded / MealCorrected                | Consumption             | Nutrition State, Audit                                   |
| ObservationRecorded                         | User Context            | Eligibility, Nutrition State                             |
| RecipeVersionPublished                      | Recipe Knowledge        | Food Knowledge, Planning                                 |
| DatasetReleasePublished                     | Data Publication        | Food Knowledge, recomputation coordinator                |
| RuleSetActivated                            | Nutrition Science       | Nutrition State, Planning, impact analysis               |
| NutritionStateComputed                      | Nutrition State         | Web notifications, Planning, Audit                       |
| PlanRequested                               | Planning                | Optimizer worker                                         |
| PlanValidated / PlanRejected                | Planning                | Web, Audit, evaluation pipeline                          |
| ConsentRevoked                              | Identity & Consent      | Integration shutdown, deletion/retention workflow        |
| EntitlementChanged                          | Commerce & Entitlements | API authorization, capability refresh, audit             |
| UsageReserved / Consumed / Released         | Commerce & Entitlements | AI orchestration, billing reconciliation, support        |
| MigrationVerified / AuthoritySwitched       | Portability & Sync      | local cleanup, cloud activation, audit                   |
| CaptureDraftProduced / Confirmed / Rejected | AI Orchestration        | Consumption or Recipe Knowledge, usage accounting, audit |
| ToolInvocationConfirmed / Refused           | AI Orchestration        | owning application module, audit                         |

Cloud events are published transactionally through an outbox. Local events use
the same envelopes in a durable browser transaction log. Consumers MUST be
idempotent, traceable, and tolerant of duplicates and delayed delivery.
