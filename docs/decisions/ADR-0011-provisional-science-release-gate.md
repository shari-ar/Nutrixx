# ADR-0011: Provisional scientific policy during MVP development

| Field                      | Value                                  |
| -------------------------- | -------------------------------------- |
| Status                     | Accepted                               |
| Date                       | 2026-10-10                             |
| Deciders                   | Nutrixx Product                        |
| Owner                      | Nutrixx Product                        |
| Related decisions          | ADR-0008, ADR-0010, OD-002             |
| Supersedes / superseded by | Review timing in ADR-0008 and ADR-0010 |

## Context and problem

ADR-0008 and ADR-0010 establish conservative recorded-intake semantics and
uncertainty rules. Their original review gates required independent scientific
approval before user-facing activation during Stage 3. The product owner has
chosen to complete the local MVP and its end-to-end evaluation first, then
commission qualified clinical review and corrections before public launch.

## Decision

Source-attributed, versioned scientific policies may be marked **provisional**
and used in the private MVP while the product is being built and evaluated.
Each provisional release records its author, source, applicability, known
limitations, and verification evidence. The conservative comparison and
abstention rules in ADR-0008 and ADR-0010 remain in force. Qualified clinical
and user-language review of the completed product, its scientific policies,
and evaluation results is a gate before public launch. Any corrections from
that review are versioned and retested.

This decision changes only the review timing and publication status. Existing
intended-use, population, and certainty boundaries remain in force. Private
MVP interfaces identify provisional results as
recorded-intake estimates for general wellness.

## Consequences

- Stage 3 implementation and private product evaluation can proceed with
  traceable provisional policies and golden tests.
- Public launch requires attributable qualified review and correction of
  findings.
- All documentation that describes the Stage 3 scientific release gate follows
  this decision where earlier ADR wording differs.
