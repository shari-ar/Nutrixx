# ADR-0020: User-controlled local files for editing and recovery

| Field                      | Value                                    |
| -------------------------- | ---------------------------------------- |
| Status                     | Accepted                                 |
| Date                       | 2026-10-18                               |
| Deciders                   | Product, Data, Web Engineering, Security |
| Owner                      | Nutrixx Data                             |
| Related requirements       | FR-015, FR-021; QR-005                   |
| Supersedes / superseded by | None / None                              |

## Context and problem

Users need both a file they can deliberately edit and a file that reconstructs
their local database with its transaction history. A canonical record seal and
full-log replay correctly reject an unsynchronized manual edit to the current
backup artifact. Browser-local users also need optional file confidentiality
without creating an account or sending nutrition content to Nutrixx servers.

## Decision drivers

- Give users practical control over their own facts.
- Preserve exact, independently verified recovery when users choose backup.
- Make file confidentiality independent of login and storage authority.
- Keep one active pre-release contract and one clear import behavior per kind.

## Considered options

1. Keep one full-log file for editing and recovery.
2. Offer separate editable and complete-backup payload kinds inside one
   versioned envelope, with optional browser-local encryption for each.
3. Require a server account for encrypted files.

## Decision

Adopt option 2. `editable-data` exports user facts as schema-governed portable
projections and imports approved differences as new canonical transactions.
`complete-backup` exports canonical records plus full transaction history and
restores only after digest, record-seal, and replay validation. Password
protection wraps either kind using browser-local authenticated encryption.
Account identity, storage authority, kind, and encryption remain independent.

The [local portability contract](../data/local-portability.md) defines the
envelope, import semantics, protection profile, and acceptance evidence. This
decision replaces the pre-release export draft in the baseline design.

## Consequences

### Positive

- Plain editable files support meaningful user corrections and transparent
  import review.
- Full backups retain ordered history and command deduplication state.
- Local-only users receive the same file-protection choice as account holders.

### Costs and trade-offs

- Two payload kinds require distinct validation and import paths.
- Full backups remain larger than editable files because the log retains
  mutation snapshots.
- Password-protected files depend on the user's custody of the passphrase.

## Validation and review triggers

The four kind/protection combinations, atomicity, diff review, replay,
conflicts, and passphrase failure run in browser acceptance tests. Review this
decision when the local authority model, supported cryptography, or user
portability requirements change.
