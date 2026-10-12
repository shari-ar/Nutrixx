# Planning route

The planning page hosts the Free browser-only one-day planner. It receives the
user's selected foods and meal slots, runs the bounded search in a Web Worker,
shows independently validated drafts and alternatives, and records explicit
acceptance as a separate local plan revision. Recorded meals remain in the
consumption ledger. The browser planning store checks source freshness before
publication and before presenting an accepted plan as current.
