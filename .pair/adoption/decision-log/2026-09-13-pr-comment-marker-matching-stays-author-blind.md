# Decision: PR-comment marker matching stays author-blind — the planting risk is accepted, recorded, with an exit path

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

`pr-comment.mjs` (shipped in `review-phase` and `green-fix`) makes publication idempotent by reading
the PR's comments back and matching the ONE whose body contains the hidden marker verbatim
(`findByMarker`, no author predicate). An independent pass over review 5190603055 (q-7) named the
residual risk: **any** PR commenter can put the marker in a body — deliberately, or by quoting a
review comment in a reply. Two carriers then wedge publication (`marker-ambiguous`, exit 1); one
carrier makes the engine `PATCH` a stranger's comment. Run-scoped markers (canary v9) fixed
cross-cycle overwrites, not planting.

The preferred fix is an author predicate: match only comments written by the engine's own identity.
It cannot be resolved from what the engine has:

- `GET /user` — 403 for a GitHub App installation token (`GITHUB_TOKEN` in Actions), and refused
  outright by the agent proxy in the canary sandbox where the cycle actually runs.
- GraphQL (`viewer { login }`) — blocked on this host; REST only.
- `gh auth status` — reports no usable identity for the token the cycle runs with.
- The PR's own author is NOT the engine: PR #480 is authored by `rucka`, its engine comments by
  `claude[bot]`.

Worse, the publishing identity legitimately **varies per environment**: PR #480 carries
marker-bearing pair comments authored by both `rucka` (human-driven loop) and `claude[bot]` (canary).
An own-author predicate would have made the engine blind to its own earlier publication and post a
duplicate — which is the very defect the marker exists to prevent, and it would then produce the
`marker-ambiguous` wedge by itself.

## Decision

Matching stays **author-blind**, and the residual risk is accepted for now:

1. No author predicate is guessed into shipped code. The marker remains the whole identity of a
   publication, because it is the only thing stable across the identities a cycle publishes under.
2. The risk is recorded here and at the code site (`pr-comment.mjs` header), and PINNED by a
   characterization test (`pr-comment.test.mjs`, `q-7 (ADL 2026-09-13)`) that asserts the two
   accepted outcomes — a foreign carrier is edited, two carriers refuse — and that authorship never
   reaches the engine at all (`listComments` drops `user`).
3. `marker-ambiguous` stays the refusal for ANY duplicate: it never posts a third comment, so the
   wedge is loud, visible on the PR and leaves every comment intact.

Accepted because the blast radius is bounded: a planted marker costs a comment's content (recoverable
from GitHub's edit history) or one halted publication — never a merge, a label, a check conclusion or
a secret. The engine's verdict authority is the `pair-review` check and the `pr-state:*` label, not a
comment body.

## Alternatives Considered

- **`gh api user` with a marker-only fallback**: rejected — it resolves in a local human session and
  not in CI or the canary, so the predicate would apply in one environment and not the other. A
  comment created under one identity and updated from the other would be ignored, duplicated, and the
  next cycle in the first environment would then find two carriers and wedge. A fix that manufactures
  the failure it prevents is not a fix.
- **Fail closed when no identity resolves** (refuse to edit an unattributable carrier): rejected —
  that is every publication in the environment the cycle actually runs in; idempotent re-publication
  (synthesis over first review, a retried lost response) would stop working.
- **An adoption-declared publishing identity now**: deferred, not rejected — it is the exit path
  below. Declaring it before any environment can honour it would ship a key nobody sets, and the
  same blindness with more code.
- **Requiring the marker on line 1** (narrowing accidental quoting): rejected here as a partial
  measure that changes matching semantics without closing deliberate planting; it belongs to the
  exit path's design, not beside it.

## Consequences

- The engine keeps one publication identity: the marker. Behaviour is unchanged; what changes is that
  the risk is written down, visible in the script a reader opens, and asserted by a test.
- The test is a characterization test: when the exit path is taken it MUST fail and be rewritten into
  the discriminating form (a planted marker is ignored and does not block publication; an own-author
  duplicate still refuses).

## Adoption Impact

No adoption file changes today — matching behaviour is unchanged.

**Exit path** (when the engine gains a resolvable publishing identity — a repo-scoped bot account, or
a host that hands the cycle its own login): declare it in `.pair/adoption/tech/way-of-working.md`
beside `code-host-assignee`, resolve it the way `resolveMaintainer` already resolves the
scope-decision principal (ADL 2026-09-13-the-scope-decision-principal-is-read-from-adoption — from
adoption, never a literal, typed refusal when absent), then filter `findByMarker` hits to that login:
a foreign carrier is IGNORED (publication proceeds, never blocked), an own-author duplicate still
returns `marker-ambiguous`. That change updates this ADL's status and inverts the pinned test.

## References

- `.claude/skills/pair-workflow-{review-phase,green-fix}/scripts/pr-comment.mjs` (`findByMarker`,
  `listComments`, `upsert`) and their `packages/knowledge-hub/dataset/.skills/workflow/**` mirrors.
- `.claude/workflows/pair-contracts/pr-comment.test.mjs` — `q-7 (ADL 2026-09-13)`.
- Review 5190603055 (q-7), answered in PR #480 comment 5653662596.
