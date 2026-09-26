# Provenance, confidence, and uncertainty

| Field         | Value                                             |
| ------------- | ------------------------------------------------- |
| Status        | Proposed cross-cutting policy                     |
| Audience      | Data, nutrition science, engine and API engineers |
| Owner         | Nutrixx Data and Nutrition Science                |
| Last reviewed | 2026-09-22                                        |

## Required evidence envelope

Every scientific or derived value MUST be able to resolve the following:

| Field                      | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| value and canonical unit   | Exact machine-interpretable quantity                                |
| semantic identifier        | Nutrient, analyte, measure, or metric identity                      |
| basis                      | Per mass, volume, serving, day, body mass, or other denominator     |
| subject and preparation    | Food, recipe version, person, sample, raw/cooked state              |
| observed/effective time    | When the fact applies                                               |
| source and source record   | Dataset, publication, device, user, or calculation                  |
| source version and license | Reproducibility and permitted use                                   |
| method                     | Measurement, reported, calculated, estimated, or imputed            |
| quality state              | Known, estimated, imputed, below detection, not applicable, unknown |
| uncertainty                | Interval, distribution, scenario, or explicit unavailable reason    |
| transformation trace       | Versioned conversions, retention factors, and formulas              |

## Semantics

- Unknown MUST remain null with a reason; it MUST NOT become numeric zero.
- A confidence percentage MUST NOT be displayed unless it is empirically
  calibrated and its meaning is documented.
- Completeness and accuracy are separate measures.
- Aggregation MUST propagate quality and uncertainty rather than average them
  into a misleading single score.
- A derived result inherits the weakest material limitation of its inputs and
  records every version used.
- Absence of an allergen value is not evidence that the food is allergen-free.

## Run fingerprint

Each material calculation records:

```text
input_snapshot_id
food_dataset_release
scientific_ruleset
engine_build
model_version (when applicable)
solver_and_configuration (when applicable)
timezone_and_period_policy
rounding_policy
output_hash
trace_id
```

The exact input and output snapshots are retained according to privacy and
retention policy. A random seed alone does not guarantee replayability.

## User presentation

The interface shows:

- what is known and what is missing;
- whether a value was measured, reported, calculated, or estimated;
- the major assumptions that could change the decision;
- confidence/uncertainty in plain language;
- the source and effective policy where it is material;
- the next smallest input that would most improve the result.

Raw provenance remains available for audit without overwhelming the normal
user experience.
