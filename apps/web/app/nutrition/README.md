# Nutrition Route

This route presents locally calculated recorded dietary intake across macros and micronutrients. `NutritionWorkspace` reads the current meal ledger through the browser nutrition service, recalculates versioned daily and seven-completed-day snapshots, and shows source-linked references after the user chooses the US or Canada reference region. Each card discloses missing composition, contributing meals, and comparable-day coverage. The values describe recorded meals rather than a person's nutrient stores or diagnosis.

The nutrition-day time zone is a separate, versioned local preference. The device's zone is suggested after travel. A review step and explicit confirmation schedule the change at the next boundary in the current nutrition-day zone. Earlier periods retain their identity; the user can replace or cancel a pending change before it takes effect.
