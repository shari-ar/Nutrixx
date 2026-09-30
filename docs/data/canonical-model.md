# Canonical data model

| Field         | Value                                 |
| ------------- | ------------------------------------- |
| Status        | Accepted                              |
| Audience      | Data, API, engine engineers           |
| Owner         | Nutrixx Data and Domain Working Group |
| Last reviewed | 2026-09-29                            |

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
├── source record + source version + license
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

## Storage-neutral envelope

Canonical user records are serializable without browser or PostgreSQL-specific
fields. Each record carries a stable ID, schema version, subject ID, owning
context, logical version, timestamps required by its domain, and integrity
metadata. Storage adapters may add physical indexes but cannot change domain
meaning.

```text
CanonicalRecord<T>
├── record_id + subject_id + owning_context
├── schema_version + logical_version
├── payload: T
├── created_at + updated_at/effective time as applicable
├── provenance / correction reference
└── content hash for export and migration verification
```

A portable bundle contains a versioned manifest, canonical records grouped by
owning context, reference/version dependencies, per-part hashes, total counts,
and compatibility metadata. It never contains provider credentials or server
secrets.

## Normative schema version 1

The executable contract lives in
`packages/canonical-schema`. Zod is the runtime source of truth and emits a
JSON Schema Draft 2020-12 artifact with the stable identifier
`urn:nutrixx:schema:canonical-record:1`.

| Concern          | Version 1 rule                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Physical storage | No IndexedDB, OPFS, PostgreSQL, ORM, or transport fields                                           |
| Exact decimals   | Canonical base-10 strings; no exponent, negative zero, or insignificant trailing fractional zero   |
| Instants         | UTC RFC 3339 with exactly millisecond precision                                                    |
| Unknown values   | Explicit tagged value with a reason; never encoded as zero or null                                 |
| Payloads         | Bound to a registered `recordType` and `recordVersion` schema before acceptance                    |
| Integrity        | SHA-256 over UTF-8 RFC 8785 canonical JSON excluding the `integrity` object                        |
| Evolution        | Envelope uses `schemaVersion`; payload uses `recordVersion`; domain revision uses `logicalVersion` |

Schema `1` is replaceable until the first public release under ADR-0006. After
release, a published schema and its migration fixtures are immutable.

## Service-control records

Entitlement grants, hosted-usage reservations, migration sessions, AI drafts,
and assistant tool traces are operational/domain control records—not nutrition
facts. They reference stable subjects/actions but cannot modify calculation
meaning. AI drafts remain transient until transformed into a confirmed owning-
domain command.

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
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [RFC 3339: Date and Time on the Internet](https://www.rfc-editor.org/rfc/rfc3339)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
