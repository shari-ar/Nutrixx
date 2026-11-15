# Solver assets

This directory is the runtime delivery boundary for local optimization assets.
The Web build and development server copy the exact lockfile-pinned HiGHS
WebAssembly binary here before startup. Generated binaries remain ignored by
Git and enter production through the verified application build.
