# Browser workers

This directory contains browser-only background computations.
`next-meal-preparation.worker.ts` opens local IndexedDB, prepares the active
catalog and nutrition context, ranks and independently reviews the next meal,
and saves the validated run. The UI receives only its compact outcome. The
same worker validates and reloads saved runs for the planning page. Its
development acceptance mode measures the pinned catalog without user records.
The caller keeps one worker alive across sequential planning requests so the
mapped immutable catalog can be reused. It terminates the worker after two
idle minutes, an error, or the watchdog limit. Saved-run loading first checks
a disposable display view, then falls back to full canonical validation.
