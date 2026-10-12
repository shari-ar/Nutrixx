# Browser workers

This directory contains browser-only background computations. The local planner
worker receives a frozen planning request, prepares candidates, runs the bounded
search, and reviews the draft. It cannot read browser storage or call the API.
The caller terminates the worker after a result, an error, or the watchdog limit.
