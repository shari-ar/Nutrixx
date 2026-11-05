# Browser workers

This directory contains browser-only background computations.
`next-meal-preparation.worker.ts` opens local IndexedDB, prepares the active
catalog and nutrition context, ranks and independently reviews the next meal,
and saves the validated run. The UI receives only its compact outcome. The
same worker validates and reloads saved runs for the planning page.
It also reads one candidate's verified explanation from the canonical run only
when the user opens that ranking disclosure.
Pagination unmounts the previous result rows and aborts any unfinished
explanation request, which terminates its disposable worker immediately.
Closing an explanation disclosure uses the same cancellation boundary.
Planning workspace teardown terminates active recommendation, reload, and
selection operations. Repeated snapshot loads replace and terminate their
predecessors. Dashboard summary teardown also aborts its disposable load. The
development acceptance panel cancels its benchmark worker on teardown or
before starting a replacement measurement.
`next-meal-acceptance.worker.dev.ts` exclusively owns development acceptance
measurement and is absent from production builds.
The caller serializes planning operations and gives each operation a disposable
worker. It terminates the worker immediately after a result, an error, or the
watchdog limit so large catalog graphs cannot remain attached to the UI. A
newer recommendation also aborts the active recommendation worker before its
replacement starts. A saved-run load first compacts and refreshes its
disposable display view, then falls back to canonical validation when the view
is unavailable or invalid.
Catalog classification and scoring begin with a conservative eight-entry cold
start, time their real work independently, and adapt subsequent chunk sizes to
the current device. A later run starts at half its locally retained phase hint
and benchmarks again. The worker yields between chunks and reports actual
processed and total entry counts without changing ranking quality.
