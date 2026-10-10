# Current physical storage relationships

| Field         | Value                       |
| ------------- | --------------------------- |
| Status        | Implemented adapters        |
| Audience      | Data, application engineers |
| Owner         | Nutrixx Data                |
| Last reviewed | 2026-10-07                  |

This view shows the actual version `1` IndexedDB object stores and the
PostgreSQL table implemented by its repository adapter. The local website uses
the two separate IndexedDB databases. The PostgreSQL adapter is implemented
and contract-tested for server-side use. The
[logical entity view](current-logical-er.md) describes the domain contents.

```mermaid
erDiagram
    direction LR

    LOCAL_TRANSACTION_LOG ||--|| LOCAL_COMMAND_RECEIPTS : confirms
    CACHE_REFERENCE_RELEASES o|..o| CACHE_METADATA : active_pointer

    LOCAL_CANONICAL_RECORDS {
        uuid recordId PK
        uuid subjectId
        string recordType
        int logicalVersion
        json payload
        json integrity
    }
    LOCAL_TRANSACTION_LOG {
        int sequence PK
        string commandId UK
        datetime committedAt
        json mutations
    }
    LOCAL_COMMAND_RECEIPTS {
        string commandId PK
        int sequence
        string fingerprint
    }
    LOCAL_METADATA {
        string key PK
        int databaseSchemaVersion
        int canonicalSchemaVersion
    }
    CACHE_REFERENCE_RELEASES {
        string releaseId PK
        datetime publishedAt
        string manifestSha256
        string payloadSha256
        json payload
    }
    CACHE_METADATA {
        string key PK
        string releaseId
    }
    POSTGRES_CANONICAL_RECORDS {
        uuid record_id PK
        uuid subject_id
        string record_type
        int logical_version
        jsonb document
        string content_hash
        datetime updated_at
    }
```

| Database or adapter                 | Physical structure                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `nutrixx-user-data` IndexedDB       | `canonical-records`, `transaction-log`, `command-receipts`, and `metadata` object stores                   |
| `nutrixx-reference-cache` IndexedDB | `reference-releases` and `cache-metadata` object stores; the catalog payload stays inside a cached release |
| PostgreSQL repository adapter       | One `canonical_records` table with a JSONB `document` and an index on `(subject_id, record_id)`            |

The `canonical-records` store holds starting profiles, custom-food versions,
recipe versions, meal revisions, their heads, and related canonical records
together. `recordType` distinguishes them. Its primary key is `recordId`, and
`subjectId` has an IndexedDB index. The transaction log records committed
mutations, while the command receipt points to the corresponding sequence;
all three stores update atomically for a local command. The reference cache is
separate from user data and is excluded from user-data exports.

These diagrams show logical key associations between stores; repository logic
governs their consistency. The PostgreSQL adapter has one generic canonical
table, with food, recipe, and meal record types inside its JSONB documents. The target-state
[data architecture](architecture.md) describes capabilities beyond this
implemented local storage layout.
