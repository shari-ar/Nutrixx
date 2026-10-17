# Stage 4 development acceptance route

`page.tsx` exposes `/acceptance?run` and `/acceptance?run-local` in development.
The first mode measures catalog preparation and five reviewed rankings within
one worker. The second mode installs the pinned catalog into an isolated test
profile, creates a real local recommendation, and reloads it from IndexedDB.
The route serves immutable reference data locally. Production requests receive
a 404. Named browser/device reports remain private until release sign-off.
