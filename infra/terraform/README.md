# Terraform infrastructure

Reserved source-of-truth location for future cloud infrastructure after the
hosting platform and environments are selected.

## Required conventions

- Separate reusable modules from environment composition.
- Pin Terraform and provider versions with reviewed lockfiles.
- Use encrypted remote state with locking; never commit state or plan files.
- Inject secrets from an approved secret manager, never variables files in Git.
- Require formatting, validation, policy checks, review, and an approved plan
  before apply.

Do not add speculative resources before deployment architecture is decided.
