# Browser workers

This directory contains browser-only background computations. The next-meal
worker receives a frozen local-catalog request, ranks the complete catalog,
and returns a reviewed result. It cannot read browser storage or call the API.
The caller independently validates the result and terminates the worker after
a response, error, or watchdog limit.
