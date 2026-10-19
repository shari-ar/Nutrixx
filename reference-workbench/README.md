# Reference workbench

This directory holds local, operator-controlled reference evidence and pending
claims. Place operator-supplied source and proposal files here so Git ignores
them. The intake command creates content-addressed `source-*.bin`,
`proposal-*.json`, and `run-*.json` files here.
After independent review, keep the local `review.json` and fixed replay
`corpus.json` here. The candidate command writes immutable
`projection-*.json`, `replay-*.json`, and `candidate-*.json` files.

Only this README and `.gitignore` belong in Git. Back up the local workbench
separately when its pending evidence must survive a device change. A staged
claim remains pending review and has no effect on the active catalog, cooking
rules, intake references, or user records. Release construction and activation
are separate gates.

See [reference completion](../docs/data/reference-completion.md) for the
proposal format, staging command, and review workflow.
