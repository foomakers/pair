# Decision: what blocks the delivery cycle comes from adoption, not a workflow rule

## Date

2026-09-24

## Status

Active

## Category

Tooling Preference

## Context

The delivery cycle (`cycle-state.mjs`, both realizations — `pair-workflow-cycle` in-session and `pair-cli run --card`) had two hard-coded rules with no adoption escape hatch:

1. **Every severity blocks, unconditionally.** review-phase's `blocking` flag and red-verify's rejection decision were the agent's own judgment call, with no policy field to consult — a Minor finding on a tolerant project blocked exactly like a Critical one, and there was no way to declare otherwise short of the reviewer quietly under-reporting severity (never the right fix).
2. **`CAPS.dispatchesPerStory = 40`** was a literal in `cycle-state.mjs`, checked unconditionally in `resolve`. A story that legitimately needed more than 40 published handoffs (a long remediation history, several revisions) hit a permanent block with no adoption-level relief — the only recovery was `migrate-acknowledge`, binding a fresh run directory, which is bookkeeping, not a policy the project could have declared in advance.

Both defects trace to the same cause: a rule that should be a project's own choice was instead the workflow's own constant. ADR-024 §7 already states the principle for cycle rules generally ("one owner, `cycle-state.mjs`") — the fix is not to relocate the rule, it is to make `cycle-state.mjs` read it from the one place project-specific choices already live, `.pair/adoption/`.

Two related but separate defects motivated the story's other tasks: #491's repair author computed `predecessorContractHash` by hand and got it wrong (a correct repair was refused by the sealer after consuming the repair budget); #492's `resolveMaintainer` read `default-assignee`/`code-host-assignee` with a plain line-scan regex, so a documented example inside a fenced code block was indistinguishable from a real declaration.

## Decision

**One adoption key, `## Blocking Severities` in `tech/automation.md`, decides both what blocks (a severity floor) and the optional dispatch ceiling — for both realizations and both roles.**

1. **Schema**: a single severity **floor** compared by rank (`Critical | Major | Minor | Questions`, the KB vocabulary) plus an optional `max-dispatches: <n> [warn|block]` line. Absent file or section ⇒ the KB default floor `Minor` (every severity except `Questions` blocks — today's behaviour) and no dispatch ceiling at all — never a silently substituted `40`. Malformed (including a present-but-empty section or a comma list) ⇒ HALT `automation-policy-malformed`, naming the file and the line (ADR-018/D21: delta-only adoption, never a silent fallback). See the Addendum for how the floor replaced the first list-based draft.

2. **Read in both realizations, independently, from the same schema**: `apps/pair-cli/src/commands/run/blocking-severities.ts` (console) and `pair-workflow-cycle/scripts/blocking-severities.mjs`, which the cycle SKILL's Step 1 runs (in-session); a parity test (`cycle-defaults-parity.test.ts`) holds the two readers to the same policy for the same adoption files. Both merge the result into the SAME `policy` object every later `resolve`/`publish`/`packet` call in the run reuses — never re-read mid-cycle, so a review and a validator dispatched from the same run never disagree.

3. **`publish()` derives `blocking` from severity, never trusts the reviewer's claim** — the same reason `acHash` is stamped rather than read. Scoped to OPEN, non-`question`, non-`regressionRisk` findings (a closed finding's `blocking` is its own closure record; a `regressionRisk` finding is governed by the stricter DR-10 ledger coherence rule, not re-derived by severity alone). The validator half applies the same floor mechanically: `publish` refuses a `verified`/`sealed` red-verify handoff carrying a gap at or above `blockingFloor` (`red-verify-blocking-gap`) and keeps a gap below it as a non-blocking note; `pair-workflow-red-verify/SKILL.md` Step 4 documents it.

4. **`CAPS.dispatchesPerStory` is deleted.** The only per-story dispatch ceiling left is `policy.maxDispatches`: `warn` (default) prints a warning on `resolve`'s output and continues; `block` stops the run typed (`reason: max-dispatches`), naming the count and `migrate-acknowledge`. `consecutiveRedirects` (a different quantity — the durable state and the dispatched step disagreeing) is untouched.

5. **`supersede` (the maintainer's own recovery command) is generalized from red-spec-only to every stage handoff** (`--skill`, defaulting to `red-spec`), bounded to the run's own LAST handoff (`supersede-not-last`) — a maintainer recovers the last mistake of any stage, not only a preparation attempt, without rewriting history underneath evidence already built on it.

6. **A shape error never reaches the validator or consumes a repair attempt.** `publish()` runs `contractErrors()` on a red-spec contract before accepting the handoff — the shape check `verify()`/`seal()` already apply, moved earlier. A repair/revision's `predecessorContractHash` is derived by the engine (from the actual sealed manifest in git history) rather than hand-computed, closing #491's exact defect class.

7. **`resolveMaintainer` reads through the same CommonMark-aware declaration reader `#492`'s host resolution already uses** (`declarationText`, fence/HTML-comment blind) — a documented example is never mistaken for a real declaration, closing #492's exact defect class.

## Alternatives Considered

- **Leave "every severity blocks" as the workflow's own rule, with a per-project override flag threaded through CLI args.** Rejected: a flag is invisible in a diff and has to be remembered on every invocation; an adoption file is committed, reviewed, and read the same way by every run.
- **Compute `blocking`/rejection entirely in the reviewer's/validator's own judgment, with the policy value only advisory.** Rejected for review-phase findings specifically: a mechanical derivation from severity is unambiguous and removable from the reviewer's own math entirely, the same reasoning that stamps `acHash` rather than trusting it. The same mechanical rule applies to the validator: `publish` refuses a `verified`/`sealed` red-verify handoff carrying a gap at or above the floor (`red-verify-blocking-gap`).
- **Give `max-dispatches` its own section, separate from `## Blocking Severities`.** Rejected: both are "what blocks/stops" — one per-finding, one per-run — and the refinement session's own instruction was to simplify by removing causes of blocks rather than adding new adoption surface. One key, two related knobs.

## Consequences

- **Positive**: a project can declare a tolerant severity bar and an explicit dispatch ceiling without touching workflow code; the default reproduces today's behaviour exactly, so no existing project's runs change; `supersede` covers every stage's mistake, not only red-spec's; #491 and #492's defect classes are closed with regression tests.
- **Negative**: `publish()` now derives `blocking` mechanically for review-phase findings — a reviewer that deliberately wants a Major finding non-blocking for a reason severity does not capture has to file it under the right severity (or, if it is truly a defect that will not block, the `nonActionable` path already exists for that).
- **Validator half of AC1**: enforced by `cycle-state.mjs publish` — a `verified`/`sealed` red-verify handoff carrying a gap at or above `blockingFloor` is refused (`red-verify-blocking-gap`); a gap below it is kept as a non-blocking note.

## Addendum (2026-09-24 — revised AC1, round-1 review off-cycle fix)

The maintainer revised AC1 during PR #515's first review round: `## Blocking Severities` declares a **FLOOR** compared by **RANK**, not a comma-separated list — the same rule as the pre-existing `severityFloor` / `--severity-floor` elsewhere in the chain, and the KB vocabulary stays `Critical | Major | Minor | Questions` (no severity list is declared anywhere).

- The policy field is `blockingFloor` (a single severity name), not `blockingSeverities` (a list). A policy still carrying `blockingSeverities` is a typed refusal (`policy-legacy-blocking-severities`), never a silent ignore or a mixed-key merge.
- `publish()`'s derivation is `rank(finding.severity) >= rank(policy.blockingFloor)`, ranked by the resolved review template contract's own `severityRanks` — never a review draft's own claim — when one is resolved (`policy.severityRanks` when a caller supplies it, else `publish` loads it itself from the same on-disk `*.contract.json` cache the review stage resolves), else pair's default table (`Critical` 4 > `Major` 3 > `Minor` 2 > `Questions` 1, case-insensitive). A severity no rank covers blocks (fail-safe); a floor no rank covers releases nothing (fail-safe — every finding stays blocking). A draft that ALSO carries `severityRanks` once the template's are resolved must agree with them exactly or publish is a typed refusal (`severity-ranks-mismatch`) — a draft never ranks on its own.
- The same floor now reaches every stage packet explicitly: `pair-cli`'s `packetFor` and `pair-workflow-cycle/scripts/cycle-dispatch.mjs`'s `packet` command both render `$policy.blockingFloor` (never a list) into every dispatch, and `cycle-dispatch.mjs packet --severity-floor F` writes `blockingFloor: F` into `$policy`, replacing a declared floor with no conflict error.
- A `## Blocking Severities` section present but declaring nothing (an empty body) is malformed (`automation-policy-malformed`, naming the section) — it no longer falls back to the default the way an ABSENT section does.
- `resolve`'s own `max-dispatches` warning (mode `warn`) is relayed to the operator (`onNotice`), not only recorded internally.
- `pair-implement-batch.js`'s own `MAX_DISPATCHES_SAFETY = 200` backstop is removed — the loop-safety backstops that remain are `CYCLE_CAPS.consecutiveRedirects` and the self-redirect (`seen`) guard (DT-10, unchanged); the dispatch ceiling itself is `policy.maxDispatches`, enforced once by `cycle-state.mjs resolve`.
