# VS Code workspace configuration

Repository-wide editor recommendations and safe defaults shared by all
workspaces.

## Contents

| File              | Responsibility                                               |
| ----------------- | ------------------------------------------------------------ |
| `extensions.json` | Recommended language, lint, formatting, and container tools  |
| `settings.json`   | Workspace formatting, validation, and file-handling defaults |

## Rules

- Store only team-wide settings; personal preferences belong in user settings.
- Keep the editor aligned with repository CLI tools, never as a replacement.
- Do not add secrets, local paths, or settings that modify generated files.
- Prefer root settings over per-application duplication.
