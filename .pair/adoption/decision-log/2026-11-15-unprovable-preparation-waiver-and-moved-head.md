# Decision: an unprovable preparation is left by a verified waiver or a moved head, never by custody

## Date

2026-11-15

## Status

Active

## Category

Process

## Context

Follow-up of #645/#646 (#641). A remediation preparation refused `unprovable` blocked the run as `failed-preparation` with no way on:

- a non-causal flake (e.g. Vitest's `onTaskUpdate` RPC timeout) has no RED witness and no commit can fix it;
- a human's out-of-cycle fix moved the PR head, the failure went stale, and the cycle re-prepared on the old head (`stale`), then refused `unprovable` again on the fixed code.

## Decision

- **Moved head**: a remediation preparation that sealed nothing (rejected by `validate` — already the rule — or refused `unprovable` / `split-required`) has no authority over a PR head moved outside the run: that head is re-reviewed, never re-prepared. Custody is untouched: `verify-chain` judges the new commits as always.
- **Flake, same head**: the owner-approval channel (2026-11-11) gains one kind, `preparation-waiver`. Same verification: a PR comment read through the bound host, author a `User` and the adopted maintainer, story/PR match. Owed only when the run's last handoff is that phase's `unprovable` preparation, for findings it refused. Recorded in `owner-approvals.json`, bound to that attempt; `resolve` routes one re-review carrying `$waived` (human disposition, non-blocking).
- Chosen as the smallest safe path: one more kind on an existing verified channel, one more refusal class on an existing moved-head rule. No new command, no new file.

## Consequences

- A waiver closes findings, never custody: no seal, `verify-chain` check, custody override or merge gate changes. An agent cannot produce it alone: the artifact is a maintainer's host comment the script verifies.
- Limit (deliberate): only `unprovable` is waivable. `split-required`, a rejected contract or a failed GREEN keep their own routes.
- Limit (pre-existing, unchanged): the reviewer can still record a `human` transition by itself. The waiver adds a verified source for that transition. It does not add a publish-time check.
