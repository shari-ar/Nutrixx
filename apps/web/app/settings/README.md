# Settings Route

This route owns browser storage status and recovery controls for Local authority.
It displays retention and capacity honestly, requests persistence only after a
user action, downloads internally verified exports, and requires a destructive
preview before clearing user and reference databases. It must never describe
browser persistence as a backup or silently upload local data.

The Restore control verifies a versioned JSON export, shows its record and
transaction counts, and requests a second confirmation before atomically
replacing canonical user data. It reconstructs the local profile locator from
the verified starting-profile record. The reference catalog stays in its
separate cache and can be installed from the dashboard.

The page also links to the nutrition-day time-zone control on the Nutrition
route. Travel-zone changes require an explicit review and confirmation before
the next nutrition-day boundary.
