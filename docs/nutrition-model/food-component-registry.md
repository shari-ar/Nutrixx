# Food component registry: feasibility coverage

| Field         | Value                                             |
| ------------- | ------------------------------------------------- |
| Status        | Implemented local recorded-intake scope           |
| Audience      | Nutrition science, data, engine, product, quality |
| Owner         | Nutrixx Nutrition Science                         |
| Last reviewed | 2026-10-11                                        |

## Scope and identity

The local recorded-intake engine tracks all 112 active concepts in the
feasibility Access database's `nutrients` table. The committed registry retains
each original Access code, US English name, category, unit, and classification.
Its stable component ID remains independent of the Access file. The original
classification contains 55 nutrients, 50 bioactives, five contaminants, and
two other components. These classifications describe the feasibility catalog;
personal intake recommendations follow the separate target policy.

The 27 concepts in the provisional adult target policy retain their existing
canonical nutrient IDs. Additional concepts receive stable
`food-component.<access-code>` IDs. The registry supplies presentation names,
category filtering, and exact identity matching for recorded meal calculations.

## Evidence boundary

USDA FoodData Central Foundation and SR Legacy observations connect to a
component only when its source nutrient ID, chemical meaning, and unit match.
The selected IDs were checked against the two source JSON releases used to
build the bundled food catalog. Uncertain equivalences carry an explicit
unmapped state, including total vitamin K versus phylloquinone, boron
and fluoride with different units, glutamine with an unavailable source
observation, and individual fatty acids versus broader fatty-acid groups. Sugar observations
from the two source releases retain two alternate IDs; a meal containing both
for one component remains ambiguous until resolved at the source.

The initial release maps 77 components through 78 exact USDA source IDs.
The other 35 components accept compatible custom food observations and retain
explicitly unavailable source composition when food facts are absent.

Each of the 112 components has a daily recorded subtotal, evidence state,
contributing meals, missing item IDs, and a seven-completed-day trend. A
measured zero is distinct from unavailable composition. Components with
unmatched food evidence carry an unavailable state, including bioactives and
contaminants. User-entered custom food facts may use a registry component ID
with its declared unit and remain attributed to the user-entered food version.

Personal intake targets remain the separate, source-attributed 27-concept
[adult policy release](target-policy-v1.md). Other components show recorded
amounts when supported by composition evidence and carry an explicit
unavailable target status. Contaminants retain this target status.
Food-derived water is kept distinct from the dedicated hydration log.

## Browser presentation

The Nutrition page starts with six key components and offers the complete
112-component register with category and search controls. Each card exposes
recorded composition coverage and source-scoped target information. The custom
food editor provides a searchable list of component IDs and units for entering
label or measured facts. The calculation rule revision invalidates previous
27-component derived snapshots and rebuilds them from existing meal revisions;
the authoritative meal and food records remain intact.
