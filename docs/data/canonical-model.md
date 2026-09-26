# Canonical data model

| Field         | Value                                 |
| ------------- | ------------------------------------- |
| Status        | Proposed                              |
| Audience      | Data, API, engine engineers           |
| Owner         | Nutrixx Data and Domain Working Group |
| Last reviewed | 2026-09-22                            |

## Foundational value types

```text
Quantity
├── decimal value
├── unit identifier
├── basis identifier
└── precision / significant-digit metadata when known

EvidenceFact<T>
├── T value | unknown
├── subject and semantic identifier
├── valid interval + recorded_at
├── method: observed | user_entered | imported | calculated | estimated | default
├── source record + source version + licence
├── quality dimensions
├── uncertainty representation
├── unknown reason
└── lineage references

DerivedSnapshot<T>
├── T payload
├── period / effective time
├── immutable input references
├── data + rule + engine versions
├── completeness / limitations
├── output hash
└── created_at
```

## Identifier policy

Canonical identifiers are stable and provider-neutral. Provider IDs are stored
as mappings scoped to provider and release. Nutrient identity MUST distinguish
chemically or analytically different concepts; aliases are searchable names,
not identity.

Recommended interoperability:

- UCUM-compatible unit semantics where applicable;
- explicit source vocabulary mappings rather than replacing canonical IDs;
- LOINC mappings for imported laboratory observations when the source supplies
  sufficient specimen/method context;
- BCP 47 locale tags and IANA timezone identifiers.

Mappings are versioned claims with provenance and review state.

## Quantity basis

A nutrient amount is incomplete without its denominator and food state. Common
bases include per 100 g edible portion, per 100 mL, per serving, per recipe
yield, and per consumed quantity. Raw/cooked, drained, fortified, brand,
preparation method, and edible portion are not interchangeable attributes.

Conversion requires a traceable path:

```text
reported portion
→ food-specific portion conversion
→ edible mass/volume
→ composition basis
→ canonical amount
```

If no safe path exists, the value remains unknown or the user is asked to
resolve material ambiguity.

## Quality dimensions

Do not collapse quality into one unexplained score. Track at least:

| Dimension                          | Example evidence                                       |
| ---------------------------------- | ------------------------------------------------------ |
| Source reliability                 | Laboratory analysis, manufacturer label, user estimate |
| Measurement/estimation uncertainty | Interval, tolerance, scenario range                    |
| Completeness                       | Known material nutrients versus expected coverage      |
| Recency/applicability              | Release date, market, preparation, population          |
| Review status                      | Unreviewed, automated checks passed, expert approved   |

## Snapshot rules

- Published recipe versions, consumed meal-item facts, nutrition states, and
  optimizer runs are immutable.
- A plan item and a consumed meal item are different entities.
- Failure to log is not proof of zero intake.
- A daily nutrition state estimates dietary intake against targets; it does not
  represent physiological nutrient stores.
- Energy has one canonical nutrient identity. Label energy and calculated
  energy may coexist only as separately sourced observations with a declared
  selection policy.

## References

- [UCUM specification](https://ucum.org/ucum)
- [LOINC](https://loinc.org/)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
