# Stage 4 development acceptance route

`page.dev.tsx` exposes `/acceptance?run` and `/acceptance?run-local` in
development. `catalog/route.dev.ts` serves the immutable acceptance catalog.
The first mode measures catalog preparation and five reviewed rankings within
one worker. The second mode installs the pinned catalog into an isolated test
profile, creates a real local recommendation, and reloads it from IndexedDB.
The `.dev` page extension is enabled only by the development Next.js build.
Production builds contain neither route nor implementation. Named
browser/device reports remain private until release sign-off.
