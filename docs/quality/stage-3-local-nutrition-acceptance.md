# Stage 3 local nutrition acceptance protocol

| Field         | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| Status        | Automated evidence implemented; human evaluation pending    |
| Audience      | Product, nutrition science, engineering, quality, usability |
| Owner         | Nutrixx Quality                                             |
| Last reviewed | 2026-10-11                                                  |

## Scope and authority

Stage 3 acceptance covers the local Health Context, provisional adult intake
references, daily and seven-completed-day Nutrition State, immutable
recomputation, offline use, and users' understanding of the general-wellness
scope. The applicable decisions are [ADR-0008](../decisions/ADR-0008-recorded-intake-state-semantics.md),
[ADR-0009](../decisions/ADR-0009-nutrition-day-and-rolling-periods.md),
[ADR-0010](../decisions/ADR-0010-intake-uncertainty-and-abstention.md), and
[ADR-0011](../decisions/ADR-0011-provisional-science-release-gate.md).
Private-MVP references retain their provisional publication status. Qualified
scientific review remains a separate public-launch gate.

## Automated evidence

| Evidence ID    | Acceptance check                                                                                                                                                       | Test location                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| S3-SCI-001–007 | Adult iron, fiber, calcium, vitamin D, copper, and calcium upper-limit references match independently transcribed source values and retain provisional/source metadata | `packages/nutrition-engine/src/nutrition-acceptance.test.ts` |
| S3-SCI-008     | AMDR remains an energy-share range                                                                                                                                     | Same file                                                    |
| S3-SCI-009–011 | Known zero, missing evidence, exact sums, evidence-limited upper-limit relations, source-specific scope, and travel-period abstention                                  | Same file                                                    |
| S3-SCI-012     | A target change separates seven-day trend segments                                                                                                                     | Same file                                                    |
| S3-TIME-001    | Date-line travel preserves contiguous, distinct period identities                                                                                                      | Same file                                                    |
| S3-REG-001     | A target-release revision supersedes daily/rolling snapshots with correction lineage; replay is idempotent                                                             | Same file                                                    |
| S3-OFFLINE-001 | Local reload after clock advance reuses the fingerprint and makes zero network requests                                                                                | `apps/web/lib/browser-nutrition-state.test.ts`               |
| S3-UX-001      | The UI explains recorded-only scope and exposes the applicable upper-limit source and diagnostic limitation                                                            | `apps/web/components/nutrition-workspace.test.tsx`           |

The source values in S3-SCI-001–008 come from the [National Academies DRI
Appendix J](https://www.nationalacademies.org/read/25353/chapter/28),
independently of the policy module under test. The [NIH Office of Dietary
Supplements](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx)
defines the distinct RDA, AI, UL, and AMDR concepts. A source update requires
an independently reviewed fixture revision and a versioned policy release.

Run the targeted suites in the existing development environment:

```sh
npm run test --workspace @nutrixx/nutrition-engine -- src/nutrition-acceptance.test.ts
npm run test --workspace @nutrixx/web -- lib/browser-nutrition-state.test.ts components/nutrition-workspace.test.tsx
```

The root `npm run check` gate covers formatting, lint, types, the full test
suite, and production builds. Record the commit, policy release ID, catalog
release ID, browser version, and exact test output with every candidate.

## Human comprehension evaluation

Recruit at least five representative adult participants independent of the
implementation. Show each participant the actual Nutrition screen with a
single recorded meal, a composition gap, an upper-limit observation, a
seven-day view, and a travel-adjusted day. Ask them to explain the following
in their own words before revealing the intended interpretation:

| Prompt                                                     | Required interpretation                                                                         | Threshold    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------ |
| What does a low recorded amount say about your health?     | It describes logged intake, while personal adequacy or deficiency needs separate assessment     | 5/5          |
| What does an unlogged meal or missing nutrient value mean? | Its amount remains unknown; it is different from a measured zero                                | 5/5          |
| What does an amount above the upper-limit reference mean?  | Review the logged amount and source; toxicity assessment requires separate qualified evaluation | 5/5          |
| What does the seven-day trend include?                     | Seven completed days, visible gaps, and comparable policy segments                              | At least 4/5 |
| Why can a travel-adjusted day lack a comparison?           | A zone transition changes the observation period and limits interpretation                      | At least 4/5 |

Record an anonymous participant code, task answer, interpretation score,
browser/device, accessibility needs voluntarily disclosed, observed confusion,
and remediation owner. Keep health histories and other sensitive answers out
of this study record. A failed threshold leads to revised copy or interaction
and a fresh evaluation of the changed candidate. Automated UI assertions are
supporting evidence, rather than a substitute for participant responses.

## Exit decision

Stage 3 closes when the automated gate passes for the candidate, the offline
workflow remains usable, and the recorded human evaluation meets every
threshold. As of this protocol's last review, human evaluation results remain
to be collected; the Stage 3 exit decision is therefore pending.
