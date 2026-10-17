# Stage 4 local planning acceptance

| Field         | Value                                            |
| ------------- | ------------------------------------------------ |
| Status        | Evidence collected; release gate open            |
| Audience      | Engineering, quality, product, nutrition science |
| Owner         | Nutrixx Quality                                  |
| Last reviewed | 2026-10-17                                       |

## Frozen corpus

The local-only audit uses the SHA-256-pinned USDA release
`food-catalog-usda-2026-04-30.1`: 8,156 foods, 14,814 portions, and 659,308
composition observations. The request represents one next meal for a US adult
age 30 with a female reference profile, 12 applicable RDA/AI nutrient targets,
an empty accepted-meal ledger, and all installed foods available. Its fixed
instant is `2026-10-14T12:00:00.000Z`. The browser and Node audits share the
same fixture and verify the compressed artifact digest
`06397f3f38e0b60aed4c677e24224b3f0835f632930fbd8afdab3ef084eaa591`.

Run `npm run acceptance:stage4` in the DevContainer after installing the
approved catalog artifact. The isolated audit writes
`.temp/stage-4-acceptance/report.json`. The normal unit suite stays fast and
keeps its fixture-sized corpus. The browser runner uses the same real catalog
bytes through the development-only `/acceptance/catalog` route:

```powershell
node scripts/stage-4-browser-runner.mjs 'C:\Program Files\Google\Chrome\Application\chrome.exe' chrome-windows-workstation
node scripts/stage-4-browser-runner.mjs 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' edge-windows-workstation
node scripts/stage-4-browser-runner.mjs 'C:\Program Files\Google\Chrome\Application\chrome.exe' chrome-windows-local-journey local
```

The runner records a named browser/device pair in
`.temp/stage-4-acceptance/<device-label>.json`. It measures five complete
worker executions, their nearest-rank p95, catalog retrieval and input
preparation, and the maximum observed main-thread timer gap. Its isolated
browser profile and localhost request keep user records outside the corpus. The
optional `local` mode installs the catalog in its temporary profile and measures
the actual create-and-reload workflow.

## Recorded results

The Node audit classified all 8,156 entries and the independent reviewer
approved the complete ranking. It found 3,839 comparable, 3,972
evidence-limited, and 345 preparation-required entries. A repeated ranking
produced the identical result, with its SHA-256 captured in the local report.
An unknown iron observation stayed `EVIDENCE_LIMITED` with no numeric rank;
the zero-iron hard limit classified a known-iron candidate as `EXCLUDED`, and
an empty available-only inventory classified it as `UNAVAILABLE`. On
the local Linux container, catalog load, mapping, input preparation, and
ranking plus review took approximately 2.4 s, 1.4 s, 0.9 s, and 3.4 s;
peak resident memory was approximately 2.1 GB. These are process-level
diagnostics rather than browser sign-off.

Both browser runs used one Windows workstation with an Intel Core i5-11400,
24 GB physical memory, and headless Chromium-family browsers. The pinned
artifact and all 8,156 catalog identities matched the Node audit.

| Browser | Earlier UI gap | Unified-worker ranking p95 | Current UI gap |
| ------- | -------------- | -------------------------- | -------------- |
| Chrome  | 2,647 ms       | 3,460 ms                   | 17 ms          |
| Edge    | 2,670 ms       | 3,263 ms                   | 17 ms          |

The unified worker loads and maps the full catalog, constructs the input, and
runs five independent reviewed rankings. It sends a compact result to the UI.
The earlier implementation started a ranking worker for each sample, so its
worker-duration measurements use a different boundary. The UI-gap measurements
show the responsiveness change on this workstation.

An isolated Chrome profile also completed the real local IndexedDB installation,
recommendation, and saved-run reload with all 8,156 foods. Creation took 52.7 s
with a 118 ms maximum UI timer gap; reload took 16.9 s with a 14 ms gap. The
profile yielded zero comparable candidates under its newly started user context,
so the corpus ranking above remains the comparable-candidate evidence. This
end-to-end latency needs optimization before release, even though the interface
stays responsive. Additional device measurements and selection/logging evidence
remain release work.

## Exit decision

| Gate                                              | Evidence and disposition                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Pinned full-catalog census and independent review | Pass: one classification per entry, complete processed count, and approved ranking                                              |
| Sparse composition handling                       | Pass: an unknown nutrient remains evidence-limited; golden tests cover hard-rule and explanation tampering                      |
| Deterministic policy and temporal replay          | Pass: engine unit fixtures and identical repeated full-catalog ranking; result hash recorded in the local report                |
| Browser worker budget on the measured workstation | Pass for the five worker-only runs in each named browser                                                                        |
| Responsive local workflow                         | Pass on the measured workstation: 17 ms fixture gaps; 118 ms create and 14 ms reload gaps in the installed-cache journey        |
| Full local-journey latency                        | Open: the first installed-cache creation took 52.7 s and saved-run reload took 16.9 s on this workstation                       |
| Supported device/browser matrix                   | Open: Chrome and Edge measurements share one workstation; additional representative devices need measured results               |
| Complete outcome and cancellation contract        | Open: the active browser flow exposes `READY` and `NEEDS_INPUT`; the eight-status contract and cancellation remain to implement |
| Full offline user journey                         | Open: measure installed-cache load, actual selection, cancellation, and logging on each supported browser/device pair           |

Stage 4 exit remains open. The next release candidate needs faster local
creation and reload, typed non-ready outcomes and cancellation, additional
device measurements, and complete selection/logging evidence before sign-off.
The [Free next-meal contract](../engines/next-meal-contract.md) and
[quality floor](../decisions/ADR-0019-free-next-meal-quality-floor.md)
remain the governing criteria.
