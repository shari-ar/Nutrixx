# Web runtime services

This directory contains browser-only service boundaries used by client
components. Services may coordinate approved Web Platform APIs and Nutrixx
adapters, but they must not contain presentation code or silently transmit
local-authority data.

`browser-storage.ts` is the single web boundary for storage status,
user-initiated persistence, verified export download, and explicit local-data
clearing.
