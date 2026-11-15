# Food component registry: feasibility coverage

| Field         | Value                                             |
| ------------- | ------------------------------------------------- |
| Status        | Implemented local recorded-intake scope           |
| Audience      | Nutrition science, data, engine, product, quality |
| Owner         | Nutrixx Nutrition Science                         |
| Last reviewed | 2026-11-14                                        |

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

### Meal nutrient signatures

Meal Detail preserves four stable, linked highlights: energy, protein,
carbohydrate, and total fat. It fills no more than two additional linked
positions with a versioned, catalog-aware policy rather than fixed fiber and
sodium cards:

| Label                 | Qualification                                                               |
| --------------------- | --------------------------------------------------------------------------- |
| `Watch-out`           | A limiting nutrient reaches at least 20% of its FDA Daily Value in the meal |
| `Strong contribution` | An encouraged nutrient reaches at least 20% of its FDA Daily Value          |
| `Distinctive source`  | An encouraged nutrient reaches at least 10% DV and high sources are scarce  |

Watch-outs receive selection priority, followed by positive candidates scored
by meal contribution and catalog scarcity. Positive eligibility starts at 10%
DV, keeping rare trace amounts outside labeled qualification. Available
positive evidence fills the two smart positions, with sub-threshold signals
shown without a label.
This food-comparison policy is independent of personalized next-meal planning.
The initial limiting set contains sodium and saturated fat; the encouraged set
contains supported fiber, vitamin, and mineral Daily Values.

Selecting a smart card opens an active-catalog ranking for that nutrient. Foods
are ranked by percent FDA Daily Value per 100 g edible, the current normalized
comparison basis. The route states that 100 g is a comparison unit rather than
a personalized serving recommendation, exposes known-data coverage, and labels
limiting-nutrient lists as watch-outs. A manifest- and policy-keyed disposable
index is prepared in a Web Worker and remains derived data separate from
canonical user data.

Meal Detail derives the initial two smart cards immediately from the retained
meal totals. The background catalog index then refines scarcity-sensitive
ordering and labels in place, keeping populated cards visible throughout the
calculation.

Every nutrient card in the Meal Detail component browser links to the same
catalog-ranking route. Components with an FDA Daily Value use the versioned
reference threshold. Other components use a descending amount-per-100-g ranking
and state the scope of that comparison. This gives every displayed component a
consistent exploration path while keeping adequacy claims tied to components
with an applicable reference.

Policy thresholds and Daily Values cite the
[FDA Daily Value reference](https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels),
where 20% DV or more is defined as high and 5% DV or less as low.
