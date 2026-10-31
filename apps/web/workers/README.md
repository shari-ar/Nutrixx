# Browser workers

This directory contains browser-only background computations.
`next-meal-preparation.worker.ts` opens local IndexedDB, prepares the active
catalog and nutrition context, ranks and independently reviews the next meal,
and saves the validated run. The UI receives only its compact outcome. The
same worker validates and reloads saved runs for the planning page.
`next-meal-acceptance.worker.dev.ts` exclusively owns development acceptance
measurement and is absent from production builds.
The caller serializes planning operations and gives each operation a disposable
worker. It terminates the worker immediately after a result, an error, or the
watchdog limit so large catalog graphs cannot remain attached to the UI. A
saved-run load first compacts and refreshes its disposable display view, then
falls back to canonical validation when the view is unavailable or invalid.
