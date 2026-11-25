# Decision: Work-start assignment follows the authenticated runner

## Date

2026-11-25

## Status

Active

## Category

Process Decision

## Context

[Assign on start](2026-11-23-assign-on-start.md) moved card assignment to development activation. [Preserve assignment on card update](2026-11-25-preserve-assignment-on-card-update.md) extended that rule to refinement and other updates. #723 defines which identity claims the card when work starts.

## Decision

Work-start assignment uses the PM adapter's identity lookup, exposed by `whoami`. A token that authenticates as a bot account claims the card for the reported bot login. This replaces the prior convention of using the configured assignee for work-start assignment.

## Alternatives Considered

- **Use the configured maintainer for bot runs.** This would attribute the work to someone other than the authenticated runner.

## Consequences

The assignee-filtered board shows a bot claim under the bot login. For a GitHub App installation token, the adapter reads the authenticated GraphQL viewer when REST `/user` rejects the credential. If the adapter cannot resolve a login, assignment warns and leaves the card unchanged. Use an explicit login to assign a human. Card writes still apply only explicit assignees. PR assignment and maintainer decision comments retain their configured defaults.

## Adoption Impact

- [Way of Working](../tech/way-of-working.md#assignment) records the authenticated identity and bot-token rule.
