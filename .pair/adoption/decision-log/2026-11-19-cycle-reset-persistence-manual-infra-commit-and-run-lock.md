# Decision: overrides survive a reset epoch, `manual-infra-commit` is overridable, superseded handoffs are archived by resolve, one driver per run dir, a remote gate failure beats `unprovable`

## Date

2026-11-19

## Status

Active

## Category

Process

## Context

Story #691 (sub-issue of #605). On #621 / PR #690, reviews r3-r6 were rejected for custody only: a valid override was dropped once a reset set its block aside, a manual `.github/workflows` fix above a doc seal was the unwaivable `doc-code-change`, superseded-epoch handoffs were archived by hand while the driver looped on `stale-write` / `contract-attempt-overwritten`, two drivers could run one card, and `unprovable` rested on a local pass while CI failed.

## Decision

- **Override anchors** (AC1): a decision's `block` may name a current handoff OR an archived `reset-<date>-<name>` of the SAME run dir (name + content digest). The waiver stays per `(code, path, segment)`; who may decide is unchanged (ADL 2026-11-15 "maintainer decision comments").
- **`manual-infra-commit`** (AC2): a path under `.github/workflows/**` changed above a `doc`-mode seal is reported as `manual-infra-commit`, a member of `OVERRIDABLE_BREACH_CODES` and `DECISION_OVERRIDABLE_CODES`. Every other non-prose path stays `doc-code-change` (unwaivable); a mixed commit gets both. Path set limited to the evidenced case; widen only by a new ADL.
- **Archive on resolve** (AC3): when `resolve` dispatches phase P, every handoff of P (attempt >= the dispatched one) and `P-red-contract.json` older than the latest accepted `reset` decision is moved (never deleted) to `reset-<date>-*` (`-<n>` on collision) with one `maintainer-interventions.md` row each. The block the reset answered, earlier attempts, other phases and the current epoch are untouched; a contract a live handoff still names is kept.
- **Run lock** (AC5): `pair run` takes `<runDir>/run.lock` (`{pid, host, startedAt}`, exclusive create) before the first resolve. A live holder, or one on another host, ⇒ status `run-locked` naming pid and host, exit 1, no handoff touched. A dead pid on the same host is taken over and reported (under a sidecar guard, as the card lock reclaims). After an `other-run` adoption the adopted run dir is locked too. Scope: the run dir lives under the MAIN checkout, the card lock (`automation/locks/<card>`) under the invoking checkout's working area — so a second run from the SAME checkout still meets the card lock first and is skipped `run-in-progress`, exit 0 (KB automation policy for trigger bursts, unchanged); `run-locked` exit 1 is what a second run from ANOTHER checkout (linked worktree) or under an adopted run id gets. The short run-dir `.lock` mutex is unchanged.
- **Remote gate failure** (AC4): the gate an obligation rests on is the finding's `gate` field, else its `gate:<name>` location (the merge-time gate convention). When `unprovable` would park and a check of that name fails on the PR head (`readCiChecks`, now carrying `url`), the park reports `refusal: remote-check-failed` with `remoteFailure: {check, sha, url}`. No gate, no failing match or an unreadable remote ⇒ `unprovable` unchanged (fail-closed).

## Alternatives Considered

- **Waivers expire at reset**: rejected — the #621 maintainer re-posted the same 40 breaches after every reset.
- **Classify `.github/workflows` as `out-of-scope`**: rejected — it hides the infra nature of the change from the reviewer and the log; a named code is auditable.
- **Archive every pre-reset handoff at once**: rejected — it would rewrite budgets and attempt history; only the files the dispatch would collide with are moved.
- **Reuse the automation card lock (`automation/locks/<card>`)**: rejected for the cycle driver — the run dir is the shared state, and the lock must sit where `cycle-state` writes.

## Consequences

- A stale lock from a SIGKILLed run on another host needs a human (`rm <runDir>/run.lock`).
- The remote-failure park is still a stop: the maintainer fixes CI (or decides), the cause is no longer misreported.
