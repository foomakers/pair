# Decision: /review forwards a PR IDENTIFIER to verify-quality, never the resolved tier — and a supplied `$pr` never falls through

## Date

2026-08-11

## Status

Active

## Category

Process Decision

## Context

`/pair-capability-verify-quality` resolves the `risk:*` tier from the **current-branch** PR (`gh pr view` with no argument) — the standalone pre-push developer flow. `/pair-process-review` composes it from a context that is usually **not** the PR's branch (a detached review worktree, or a bare-repo review session), so the no-arg read finds no PR, the resolution fail-safes to 🔴, and the review path runs the full suite set on every PR regardless of tier. The tier-check parity #259 established for the pre-push path therefore never held on the review path, which is the path the CI gate is compared against.

Fixing it requires deciding **what crosses the composition boundary**: `/review` has already resolved an authoritative review-time tier in its Phase 1 (`/classify`, confirm-or-raise, D17), so handing that value to `verify-quality` is the obvious move — and the wrong one.

## Decision

`verify-quality` takes an **optional `$pr` argument that names WHICH PR the tier is resolved from**. The tier itself is **read, never carried**:

1. **Name the PR, never carry the tier.** `$pr` is an identifier (number or URL). `verify-quality` reads that PR's `risk:*` labels from the **code host** — the same source the CI gate reads. Nothing but an identifier crosses the boundary, so there is no second copy of the tier to keep consistent and no widen-only guard of its own is needed: the labels stay the single source of truth, review-raised (D17) tags included.
2. **No story-card fallback on the `$pr` path.** Resolution precedence is `$pr` → current-branch PR → `$story` card → fail-safe 🔴, and an entry is consulted only when the ones before it were **not supplied** — never as a retry of one that failed. A supplied `$pr` that yields no tag resolves to the fail-safe with its own specific reason ("reachable but carries no `risk:*` tag" vs. "unreadable"), distinguished by a **`risk:`-prefix test on the labels, not by empty labels** — a PR labelled `pr-state:*`/`cost:*`/type and no `risk:*` is the normal shape once the PR state flow is provisioned, and an emptiness test would misreport it as sourceless.
3. **Tier parity is not result parity.** `$pr` makes the *tier* exact, not the *result*: off-branch the suites still run against the checked-out tree. The report states `Tier source:` and `Tree:` separately and a `Tree: ⚠️` run is **advisory** for the caller — for the PR state synthesis the authoritative gate signal is CI's check on the PR head commit.
4. **The tree question is tier-independent, and it is a COMMIT question.** `Tree:` is resolved *before* the `Pre-merge tiering` flag is read, so the row (and the caller rule keyed on it) exists in the default `disabled` configuration too — otherwise a review run from an unrelated checkout reports green gates with nothing saying which code they ran on. The match test is always `git rev-parse HEAD` vs. the PR's `headRefOid`: a checkout on the PR's own branch at a *different* commit (stale, or ahead with unpushed work) is **not** the head, and a detached worktree at the head **is**; branch names are display only. Four resolved values, four rendered arms — `match`, `mismatch`, `unknown` (PR unreadable: never assert a mismatch that could not be read), `none` (no PR named).
5. **Every failure state has its own reason; emptiness and bare exit status decide nothing.** `gh pr view` exits non-zero both when the branch has no PR and when the code host is unreachable, and a PR that exists with **zero labels** is a third state — so the branch arm decides on the host's *no-PR message* (the only case that may fall through to `$story`) and on *tag presence*, never on `[ -z "$LABELS" ]`. An unreadable branch PR fails safe with `current-branch PR unreadable`, symmetric with the `$pr` path, rather than degrading to the story card's refinement tier (an under-check).

## Alternatives Considered

- **Pass the tier value `/review` already resolved in Phase 1** (`$tier=yellow`): Rejected. It creates a second source of truth for the tier that must then be kept widen-only by its own guard, and it lets a caller under-check by construction (any caller passing a stale or hand-written value narrows the set CI would run). Reading the labels keeps exactly one authority — the one CI gates on.
- **Reuse the existing `$story` argument instead of adding `$pr`**: Rejected. The story card carries the **refinement-time** tier, and review confirms-or-**raises** (D17). A PR raised at review time would resolve to the card's *lower* tier and run a **NARROWER** set than CI — an under-check, the one direction the quality model forbids. `$story` stays what it is: the pre-publish fallback for a branch that has no PR yet.
- **Compare branch NAMES when the checkout is attached, commits only when detached**: Rejected (it was the first implementation). The commit compare is correct in both shapes — `headRefOid` is fetched either way — so the name arm was strictly weaker: it reports `matches PR #N's head` for a stale or unpushed-ahead checkout of the same branch, which is precisely the "confident report about different code" the `Tree:` row exists to prevent.
- **Let a supplied `$pr` that yields no tag fall through to the next precedence entry**: Rejected. Falling through reads either a *different* PR (the branch's) or the refinement tier (the card's) while the report still claims to describe the named PR. Failing safe to 🔴 with a reason naming the actual cause is wider but never wrong, and it surfaces the configuration problem instead of hiding it behind a correct-looking widen.

## Consequences

- The review path runs the CI check set for the PR's real tier — 🟢/🟡 work in review stops running the 🔴 suite set — while an untagged or unreadable PR still widens to 🔴 rather than narrowing.
- `$pr` is **optional and additive**: every existing caller (`/pair-process-implement`, `/pair-capability-publish-pr`, direct pre-push invocations) is unchanged, and the composition contract's PASS/FAIL shape is unchanged.
- The label read is only as exact as the project's tag projection: with no `## Tag Projection` declared in `tech/risk-matrix.md`, `/classify` writes the matrix to the PR description and applies no label, so the `$pr` read fail-safes to 🔴 by design. `/review` states this qualification rather than promising exactness the flow cannot deliver in that configuration.
- A local gate run whose tree is not the PR's head is advisory, so it can never contribute a green to `ready-to-merge`; the required CI checks on the head commit remain authoritative. Because the tree resolution is tier-independent, that advisory rule now fires in the default `Pre-merge tiering: disabled` configuration as well — the configuration this repository itself runs.
- One code-host round trip per run: labels, `headRefName` and `headRefOid` come from a single `gh pr view "$pr" --json labels,headRefName,headRefOid` read, so the unreadable-PR path cannot half-succeed (two fields empty, one read) and render a mismatch it never established.

## Adoption Impact

- No adoption file change is required: this decision alters two skills' contracts (`capability/verify-quality`, `process/review`) and their generated mirrors, not a project convention. `tech/way-of-working.md` (Quality Gates), `tech/risk-matrix.md` (Tag Projection) and the quality model's tier→checks matrix are all **consumed** unchanged.
- Recorded as an ADL, not an ADR: no new library, pattern or technology is introduced (ADR-013's resolution cascade and D17/D18 are applied, not amended).
