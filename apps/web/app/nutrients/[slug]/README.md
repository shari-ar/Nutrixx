# Nutrient food-ranking route

`/nutrients/[slug]` ranks active-catalog foods per 100 g edible for any food
component shown on Meal Detail. Components with an FDA Daily Value list foods
that reach the 20% high-source threshold. Components without one receive a
plain recorded-amount ranking without an adequacy claim. A limiting nutrient is
presented as a watch-out rather than a recommendation. The route states its
comparison basis and catalog coverage explicitly.
