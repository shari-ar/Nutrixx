# ADR-0009: Nutrition-day and rolling-period policy

| Field                      | Value                                   |
| -------------------------- | --------------------------------------- |
| Status                     | Accepted                                |
| Date                       | 2026-10-10                              |
| Deciders                   | Nutrixx Product (implementation policy) |
| Owner                      | Nutrixx Product                         |
| Resolves                   | OD-007                                  |
| Related requirements       | FR-005, FR-007, FR-012; QR-002, QR-013  |
| Supersedes / superseded by | None                                    |

## Context and problem

A local calendar day can span 23, 24, or 25 UTC hours. Daylight-saving
changes, travel, timezone corrections, and meals entered later can change
which records belong to a daily or rolling result. A period policy must be
stable enough to replay and comprehensible enough to explain.

## Decision drivers

- Keep every accepted consumption event in exactly one analysis period.
- Preserve the time and place as entered while giving a stable day boundary.
- Make timezone changes explicit and reproducible.
- Recompute affected results after late entry or correction while preserving
  historical evidence.

## Considered options

1. Use UTC calendar days for everyone.
2. Rebucket all history whenever the device's current timezone changes.
3. Use a versioned, user-visible IANA **nutrition-day timezone** with
   effective-dated changes and immutable historical periods.

## Decision

Adopt option 3 as the Stage 3 implementation baseline under the product owner's
direction.

At onboarding, suggest the browser's IANA timezone as the nutrition-day zone
and let the user review or change it in Settings. The zone is a dated user
preference rather than an automatic device-timezone override. Each ordinary
nutrition day runs from local midnight to the next local midnight in that
zone. Its UTC duration may be 23, 24, or 25 hours across daylight-saving
transitions; it remains one calendar day for display and daily references.

Each consumed event stores the resolved instant, entered local date/time,
IANA zone, resolved offset, and revision history. For an ambiguous local time,
the user confirms the intended occurrence. A nonexistent local time requires
correction. The engine assigns an accepted event by instant to exactly one
period under the nutrition-day policy effective at that instant; the event's
entered local time remains available for display and audit.

A user-selected zone change takes effect at the next boundary of the current
nutrition day, calculated in the previous zone. The change begins a new,
contiguous period in the new zone; subsequent boundaries use that zone. A
travel-transition period may be shorter or longer than a normal calendar day
and carries a **travel-adjusted** marker. It displays recorded amounts and
contributors while target comparisons remain indeterminate pending a
scientifically approved normalization rule. Period identity includes the
effective zone-policy version and a unique sequence, keeping repeated or
skipped local date labels distinct. The interface shows the effective zone and
any travel adjustment.

The rolling view comprises the seven most recent **completed** nutrition
periods ending before the current period. It preserves each day's individual
target policy, coverage, and travel marker. A missing or unlogged period is a
data gap. A descriptive mean uses only comparable, observed, ordinary periods
and displays its denominator; gaps retain an unknown state, and differing
target policies remain separate. Daily upper-limit observations remain visible
as daily observations rather than being diluted by a rolling mean.

Late entry and correction remain permitted after a day closes. A changed meal
time or zone can affect its former and new periods. The engine invalidates and
recomputes those daily snapshots and every rolling snapshot containing them.
Each new immutable snapshot references the superseded result and retains its
input watermark, timezone policy, target release, and calculation fingerprint.
Prior events retain their original facts when a device clock or travel zone
changes; an explicit historical correction follows the same auditable
recomputation path.

## Consequences

### Positive

- Day membership survives reload, travel, and device timezone changes.
- Late corrections produce new evidence while retaining historical results.
- DST days and travel adjustments are visible rather than hidden in a UTC
  24-hour assumption.

### Costs and trade-offs

- A zone change takes effect at a boundary, so a travel day may temporarily
  display in the previous nutrition-day zone.
- Travel-transition periods require an indeterminate target comparison until
  an approved rule supports one.
- Period IDs, offsets, and policy versions add replay metadata.

## Validation and review triggers

The implementation gate requires Domain review of the period contract and its
fixtures. Fixtures cover DST gaps
and overlaps, 23/25-hour days, eastward and westward travel, date-line
crossings, manual zone changes, late meals, meal-time corrections, overlapping
rolling windows, and reload/offline replay. Assert exactly-once event
assignment and snapshot supersession. Revisit if research shows the boundary
policy causes material user confusion or scientific misinterpretation.

## References

- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [IETF RFC 9557: Timestamps with Additional Information](https://datatracker.ietf.org/doc/html/rfc9557)
- [ECMAScript Temporal: Time zones and ambiguous local times](https://tc39.es/proposal-temporal/docs/timezone.html)
