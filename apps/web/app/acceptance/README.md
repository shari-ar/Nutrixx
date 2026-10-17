# Stage 4 development acceptance route

`page.tsx` exposes `/acceptance?run` only in development. It measures the
installed, pinned food catalog and the real next-meal browser worker. The route
reads immutable reference data and keeps measurements in memory. Production
requests receive a 404. The private report
requires named browser/device pairs before release sign-off.
