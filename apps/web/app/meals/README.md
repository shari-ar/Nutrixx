# Meals Route

This route is the local meal ledger. It lists current recorded meals and
provides unlimited manual logging, correction, copy-as-new, and removal. Every
action uses the browser-backed canonical ledger; corrections and removals retain
immutable prior revisions.
Each new or corrected revision stores calculated nutrient totals from its exact
food and recipe references. Unknown ingredient composition produces an explicit
incomplete result, while the detail route shows the current nutrition snapshot.
