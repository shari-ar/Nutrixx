# Local export and import contract

| Field         | Value                                 |
| ------------- | ------------------------------------- |
| Status        | Accepted target contract              |
| Audience      | Product, data, web, security, quality |
| Owner         | Nutrixx Data                          |
| Last reviewed | 2026-10-18                            |

This is the single pre-release contract for user-controlled local files. The
pre-release baseline uses format version `1`; implementation replaces the
earlier export draft in place. [ADR-0020](../decisions/ADR-0020-user-controlled-local-portability.md)
records the decision. The persistence adapter, browser-local password
protection, Settings controls, and local-file acceptance tests implement this
baseline for the current local-only product.

## Independent choices

Account identity, nutrition-data authority, file purpose, and file protection
are separate dimensions. A `LOCAL` user can create and open either file kind,
with or without a Nutrixx account and with or without encryption. Account-only
login leaves nutrition facts in the browser. Export and import in `LOCAL` mode
process nutrition payloads in the browser.

| File kind         | Transaction history | Primary use                                         | Import operation                     |
| ----------------- | ------------------- | --------------------------------------------------- | ------------------------------------ |
| `editable-data`   | Excluded            | Inspect, deliberately edit, and transfer user facts | Review diff, then commit corrections |
| `complete-backup` | Included            | Reconstruct the local authority and its history     | Verify, then atomically replace      |

Encryption is an independent option for both kinds. The primary Settings
choices are **Editable data** and **Complete backup**; each exposes an optional
**Encrypt this file** control. The choice descriptions explain whether
transaction history is included. This yields four combinations without four
competing storage models.

## Artifact envelope

Every file declares `format: "nutrixx.local-file"`, `formatVersion: 1`, `kind`,
and `protection: "plain" | "password-encrypted"`. A strict discriminated schema
validates the envelope and its selected payload. The plain envelope carries a
UTF-8 JSON `content` object. The encrypted envelope carries a versioned
cryptographic header and encoded ciphertext; only the minimum routing and
cryptographic fields remain readable before decryption. The header is bound as
authenticated additional data.

The editable payload contains a manifest, one local subject identity, and an
ordered collection of portable user-fact projections. Each projection has a
stable type and identifier, a source revision for conflict detection, explicit
units and references, domain-validated payload fields, and canonical metadata
needed for transfer into an empty local profile. The exporter maps
canonical user-authored facts and user-approved observations into these
projections. Its scope is user-authored facts; record integrity seals,
transaction history, derived nutrition snapshots, planning runs, disposable
views, and reference datasets stay in their respective stores. Its manifest
describes structure and counts; import generates fresh canonical digests for
approved edits. Import transforms each accepted projection into a canonical
database record.

The complete-backup payload contains a strict manifest, all canonical local
user records, and the complete ordered local transaction log. Its manifest
records schema and database versions, creation time, subject identities,
record and transaction counts, final sequence, and a SHA-256 digest over the
canonical payload. Record seals and replay checks establish internal
consistency. Reference releases and disposable caches remain separately
downloadable and stay outside both file kinds.

The format schema defines a single profile per file. Export includes linked
user facts required to interpret that profile. Stable identifiers preserve
relationships, while import validation checks their type and referential
integrity. A missing reference release can be installed after user facts are
restored; the affected calculation remains unavailable until then.

## Import semantics

The importer identifies the file kind and protection from the envelope, applies
size and structural limits, decrypts locally when selected, and validates the
complete payload before offering a write. Parsed file content remains
untrusted input. Unknown types, unsupported units, invalid ranges, duplicate
identifiers, broken user-fact relationships, and conflicting revisions produce a
reviewable error before any canonical write.

The plain editable review currently accepts at most 50 MB and 10,000 facts. A
digest binds the reviewed canonical file content to the confirmation step, and the
destination revisions and relationships are rechecked inside the write
transaction.

For `editable-data`, the importer compares each projection with the current
canonical facts and shows additions, corrections, explicit deletion requests,
unchanged facts, and conflicts. Omission leaves existing facts unchanged.
Deletion uses an explicit schema-governed intent and receives a separate
confirmation. After approval, the importer creates fresh canonical records,
record seals, provenance, and transaction-log entries in one atomic operation;
it recomputes affected derived state. The original history remains intact.
Import into an empty local profile uses the same validation and commit path.

For `complete-backup`, the importer validates record seals, manifest digest,
transaction order and identities, mutation results, and equality between
replayed history and exported records. The user reviews the source profile and
replacement scope, then explicitly confirms replacement. One strict local
transaction installs records, log entries, and reconstructed command receipts.
Failure preserves the prior local authority. An optional pre-replacement export
gives the user an additional recovery copy.

SHA-256 checks consistency and accidental corruption. Authenticated encryption
provides confidentiality, while independent trusted signatures would establish
origin authenticity. Plaintext backup history can be
manually reconstructed by a knowledgeable editor, while the supported editing
path remains `editable-data`.

## Local password protection

Browser Web Crypto derives a per-file AES-256-GCM key from a user-provided
export passphrase with PBKDF2-HMAC-SHA-256, a fresh random salt of at least
128 bits, and at least 600,000 iterations. Each file uses a fresh random
96-bit GCM IV and a 128-bit authentication tag. The envelope records the exact
KDF and cipher parameters needed for decryption; decryption verifies the tag
before parsing the payload. New files use 600,000 iterations; readers accept
only the documented bounded range.

The passphrase is independent of Nutrixx login credentials. Key derivation and
encryption occur in the browser; passphrase and plaintext remain on the user's
device. The UI explains that losing the passphrase makes the encrypted file
unrecoverable. Plain editable files support deliberate text editing; encrypted
editable files are decrypted through Nutrixx for review and import.

The encrypted JSON envelope contains only `format`, `formatVersion`, `kind`,
`protection`, `crypto`, and `ciphertext`. Its `crypto` header declares the KDF,
iteration count, base64url salt, cipher, base64url IV, and tag length. The
canonical header is AES-GCM additional authenticated data. The plaintext is
the complete corresponding plain file envelope, including its content. The
reader accepts 600,000–2,000,000 PBKDF2 iterations, rejects unknown header
fields and algorithms, and returns the same decryption error for a wrong
passphrase and altered authenticated content. Neither passphrases nor derived
keys are saved in browser storage. Plain editable payloads remain limited to
50 MB; the encrypted editable envelope may occupy up to 70 MB due to base64url
encoding. Complete backup review uses the full backup validator after local
decryption.

## Acceptance evidence

- All four kind/protection combinations download and reopen from actual local
  browser storage in tests; Settings tests exercise the four user choices.
- A deliberate plain-text edit produces a precise diff and a fresh, attributable
  canonical transaction after confirmation.
- Explicit deletion, omission, conflict, duplicate, malformed unit, missing
  reference, oversized payload, and interrupted write have independent tests.
- Full-backup restore reproduces records, log order, and command receipts;
  replay divergence leaves the existing database intact.
- Wrong passphrases, modified headers, modified ciphertext, and unsupported
  cryptographic parameters fail before payload parsing or canonical writes.
- Current local-only export and import tests observe zero nutrition-payload
  network requests. Account-only mode receives the same privacy check when
  that roadmap capability is introduced.

## References

- [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
