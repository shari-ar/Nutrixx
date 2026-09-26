# Documentation theme

This directory contains the thin Nutrixx customization layer over the VitePress
default theme.

- `index.ts` extends the default theme without replacing its accessible behavior.
- `custom.css` applies brand tokens and restrained presentation refinements.

Keep structural documentation behavior in `../config.mts`. Prefer VitePress CSS
variables over deep component overrides so framework upgrades remain predictable.
