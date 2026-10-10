# Current logical entity relationships

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| Status        | Implemented local scope                |
| Audience      | Product, data, application engineering |
| Owner         | Nutrixx Data                           |
| Last reviewed | 2026-10-07                             |

This view shows the food, recipe, meal, and starting-profile concepts currently
implemented for local use. It describes domain relationships. The
[physical storage view](current-storage-er.md) shows the SQL table and IndexedDB
object stores where these concepts are stored.

```mermaid
erDiagram
    direction LR

    CATALOG_RELEASE ||--o{ CATALOG_FOOD : publishes
    CATALOG_FOOD ||--o{ FOOD_PORTION : offers
    CATALOG_FOOD ||--o{ COMPOSITION_OBSERVATION : has
    CUSTOM_FOOD ||--|{ CUSTOM_FOOD_VERSION : publishes
    RECIPE ||--|{ RECIPE_VERSION : publishes
    RECIPE_VERSION ||--|{ RECIPE_INGREDIENT : contains
    RECIPE_VERSION ||--o{ RECIPE_STEP : describes
    RECIPE_VERSION ||--o| RECIPE_OUTPUT_FOOD : produces
    MEAL ||--|{ MEAL_REVISION : records
    MEAL_REVISION ||--o{ MEAL_ITEM : contains
    MEAL_REVISION ||--|| CONSUMPTION_EVENT : emits

    STARTING_PROFILE {
        uuid profileId PK
        uuid ownerSubjectId
        int revision
        string primaryGoal
    }
    CATALOG_RELEASE {
        string releaseId PK
        datetime publishedAt
        string manifestSha256
    }
    CATALOG_FOOD {
        string releaseId PK, FK
        uuid foodId PK
        int revision PK
        uuid sourceId
        decimal approximatePriceUsdPer100g
        json preparationStates
    }
    FOOD_PORTION {
        uuid portionId PK
        uuid foodId FK
        int foodRevision FK
        decimal gramWeight
    }
    COMPOSITION_OBSERVATION {
        uuid observationId PK
        uuid foodId FK
        int foodRevision FK
        string nutrientId
        string valueState
    }
    CUSTOM_FOOD {
        uuid foodId PK
        uuid ownerSubjectId
        int activeRevision
    }
    CUSTOM_FOOD_VERSION {
        uuid foodId PK, FK
        int revision PK
        string name
        decimal approximatePriceUsdPer100g
        json portions
        json composition
    }
    RECIPE {
        uuid recipeId PK
        uuid ownerSubjectId
        int activeVersion
    }
    RECIPE_VERSION {
        uuid recipeId PK, FK
        int version PK
        decimal finalEdibleGramWeight
        decimal servings
    }
    RECIPE_INGREDIENT {
        uuid ingredientId PK
        string referenceKind
        string versionedReference
        decimal edibleGramWeight
    }
    RECIPE_STEP {
        int position
        string instruction
        json ingredientIds
    }
    RECIPE_OUTPUT_FOOD {
        uuid foodId PK
        int revision PK
        uuid recipeId FK
        int recipeVersion FK
        json nutrition
    }
    MEAL {
        uuid mealId PK
        uuid ownerSubjectId
        int activeRevision
    }
    MEAL_REVISION {
        uuid mealId PK, FK
        int revision PK
        datetime occurredAt
        string state
    }
    MEAL_ITEM {
        uuid itemId PK
        string referenceKind
        string versionedReference
        decimal edibleGramWeight
    }
    CONSUMPTION_EVENT {
        uuid eventId PK
        uuid mealId FK
        int mealRevision FK
        string eventType
    }
```

`ownerSubjectId` associates the starting profile, custom foods, recipes, and
meals with the same local subject. The starting profile is a separate record;
the association uses subject identity rather than a physical `profileId`
foreign key.

`approximatePriceUsdPer100g` is optional. It is an illustrative USD amount for
100 g of food and remains separate from USDA nutrient facts and live market
quotes. Three exact foods in the pinned catalog receive product example values
at read time; the integrity-checked USDA artifact remains unchanged.

`RECIPE_INGREDIENT` and `MEAL_ITEM` each carry one versioned reference. The
reference can identify a catalog food, a custom-food version, a recipe output
food, or an exact recipe version according to its reference kind and release.
The diagram leaves those polymorphic links as fields to avoid implying a
single foreign key. Recipe ingredients and steps are embedded in recipe-version
payloads; meal items are embedded in meal-revision payloads. Custom-food
portions and composition are embedded in custom-food versions. A voided meal
revision has no items while its earlier revisions remain available.
