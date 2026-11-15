# Decision: a maintainer's verified decision comment resumes a parked run; no supersede chain, no flag-chosen author

## Date

2026-11-15

## Status

Active

## Category

Process

## Context

Story #647 (slice 3 of #641). Decision stops (review and green-fix escalations, external findings, `unprovable`, `split-required`, contradiction budgets, custody breaches, a spent `maxFixRounds`) were recovered by hand: a `supersede` chain, a hand-written `custody-overrides.json`, a forced head move, or a card edit plus a new run. #642 spent 8 h 12 on two policy stops and 7 h 54 on a finding that contradicted a rule approved minutes earlier; #626 spent 36.7 h on an external finding. `apply-scope-decisions` and `approve-correction` let the caller name whose comments count (`--maintainer`).

## Decision

- **One comment kind.** A maintainer decision is ONE fenced `json` block on the card or the PR: `{schemaVersion: 1, kind: "maintainer-decision", story, block, choice: decide | amend | override | reset, reason}`, plus `scope` / `withdraws` / `overturns` (amend, `scope` also decide) or `overrides` (override). Parsed rigidly: closed key set, exactly one fence, typed fields; free text is never parsed. A body carrying a `<!-- pair` marker is an agent's comment and never a candidate.
- **Author from the host only.** `cycle-state.mjs decisions` reads the comments through the bound adapters (`listCardComments`, `listComments`, both returning the host-reported author). Accepted only from a `User` whose login is the adopted maintainer (`code-host-assignee`, else `default-assignee`). No flag chooses the author: `--maintainer` is refused by `decisions`, `apply-scope-decisions` and `approve-correction` (the whole class of comment-authenticated commands). Anything else is recorded `ignored` with its reason. **Unedited only** (review r0-2): the host reports a comment's creator, not its editor, so a comment whose `updated_at` differs from `created_at` (or a host that cannot report both) is refused — `comment-edited` / `comment-unverifiable` — for maintainer decisions, scope decisions and owner corrections alike; to correct a decision, post a new comment. An accepted decision whose comment is later edited or deleted (on a source read successfully) is revoked and recorded. Amends point 2 of [ADL 2026-09-13](2026-09-13-the-scope-decision-principal-is-read-from-adoption.md) and the corresponding line of ADR-024.
- **Every resolve consumer picks up first**: `pair run` before every resolve, the in-session coordinator at Step 1, and every stage skill's Step 0 (red-spec, red-verify, implement-phase, green-fix, review-phase) — so the batch, whose resolves happen inside its stages, sees a decision posted mid-run; the batch also re-picks on a blocked answer.
- **Block, not chain.** `resolve` names every blocked answer's `block` (`<last handoff file>@<12-hex content digest>`) and consumes the newest accepted decision naming the current block. A newer refusal is a new block, so a stale decision never resumes it and a newer decision wins; no handoff is renamed and no head move is needed. The resumed dispatch carries `$maintainerDecision`.
- **Custody override** replaces the hand-written file: `custody-overrides.json` is derived at every pickup from the override decisions in force whose `block` is a handoff of THIS run directory (file name + content digest — a comment of another run waives nothing), attributed to the verified login and the comment URL; an entry nobody decided, a withdrawn one (`amend.withdraws` retracts any decision, override included), and one whose comment was edited or deleted are dropped. A failed host read revokes nothing. Only the codes `OVERRIDABLE_BREACH_CODES` already lists may be named (decision-log 2026-09-18 stands otherwise).
- **Reset** (AC-5/AC-6): a custody or seal misalignment is cleared by a successor revision of the sealed line on the current head, sealed only by `red-verify`; with no seal, a fresh review. It restarts `autoRecoveryRounds` (recorded `budgetResetAt`), keeps `maxFixRounds`, `redRepairs`, `greenRetries`, and is recorded in `recovery.json` `resets` and `maintainer-interventions.md`.
- **Authority conflict** (AC-23): before a review's findings reach a preparation, a finding whose location paths or assessed AC overlap an active decision's `scope` parks `decision-conflict` (class decision) naming both. An amendment withdrawing the decision lets the round proceed; a decision on the block upholding it sends the findings back to the reviewer, who closes them `transition: human`. Overlap, not semantic contradiction: a false positive costs one comment and no dispatch.
- **Fail-closed policy** (AC-12): a preparation missing a policy decision applies the most restrictive reading, records `assumptions: [{id, policy, reading}]` in the contract; `publish` stamps them and posts a marker-keyed Assumption comment on the card. An `amend` with `overturns` must name the preparation handoff that recorded the assumption as its `block` (the Assumption comment quotes it; ids such as `A-1` repeat across runs), and opens a new round once the review converged (or joins the next remediation round).
- **Maximum one extra round** per `decide` on a spent `maxFixRounds`; the next block asks again.

## Alternatives Considered

- **Re-verify the comment on the host at custody time** (`red-snapshot.mjs` reading the comment): rejected for this slice — custody would depend on the network at every `verify-chain` (base syncs, every review). The derived file is regenerated before every resolve instead.
- **Keep `--maintainer` for local use**: rejected — the flag let any caller choose whose comment authorizes; the console commands `decide` / `supersede` remain for a maintainer at the keyboard.
- **The reviewer flags conflicts in its finding**: rejected — it puts the authority check in the judged party; the overlap check is mechanical and before dispatch.

## Consequences

- No custody, HALT or contract rule is removed; existing custody and contract tests stay green. `supersede`, `decide` and `reset-group` stay as console commands; a decision stop never needs them.
- Every decision is in `maintainer-decisions.json`, `maintainer-interventions.md` and the card telemetry (`maintainer-<choice>`, `maintainer-ignored`).
- Declared limits: (1) a stage agent running on the maintainer's own host credentials could post a comment as the maintainer — the same boundary as the approval token (ADR-018 § Amendment), closed by the dedicated agent identity (#218), not by this slice; (2) the run directory remains local trusted state (as `owner-approvals.json`, #591): a file written there between a pickup and the next `verify-chain` inside one stage is not prevented, and the regeneration before every resolve bounds it to that stage; (3) a card is a decision source only where the PM adapter implements `listCardComments` (GitHub today); elsewhere the PR is the source and the pickup reports `card:unsupported`.

## Adoption Impact

- `way-of-working.md` Assignment: the resolved maintainer login is the only decision author.
- KB `delivery-cycle.md`, `automation-policy.md`, `host-adapter-extension-guide.md`; skills `pair-workflow-cycle`, `red-spec`, `green-fix`, `review-phase`; website delivery-cycle, CLI commands and batch internals pages.
