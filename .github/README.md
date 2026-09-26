# GitHub repository automation

GitHub-specific governance and automation for Nutrixx.

## Contents

| Path             | Responsibility                            |
| ---------------- | ----------------------------------------- |
| `workflows/`     | Required CI workflows                     |
| `dependabot.yml` | Scheduled npm, Action, and Docker updates |
| `CODEOWNERS`     | Default reviewers for sensitive paths     |

## Rules

- Grant the smallest possible `GITHUB_TOKEN` permissions.
- Pin every Action to a full immutable commit SHA and retain its version comment.
- Never expose secrets to untrusted pull-request code.
- Keep workflow check names stable because branch rules may depend on them.
- Review automation changes as production code.
