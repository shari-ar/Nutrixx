# GitHub repository automation

GitHub-specific governance and automation for Nutrixx.

## Contents

| Path             | Responsibility                                |
| ---------------- | --------------------------------------------- |
| `workflows/`     | Required CI workflows                         |
| `dependabot.yml` | Low-noise npm, Action, and Docker maintenance |
| `CODEOWNERS`     | Default reviewers for sensitive paths         |

## Rules

- Grant the smallest possible `GITHUB_TOKEN` permissions.
- Pin every Action to a full immutable commit SHA and retain its version comment.
- Never expose secrets to untrusted pull-request code.
- Keep workflow check names stable because branch rules may depend on them.
- Review automation changes as production code.
- Group and cool down routine npm, Action, and Docker updates quarterly, with at
  most one open version-update pull request per ecosystem.
- Group npm security updates separately so urgent maintenance is independent of
  the quarterly version-update cadence.
