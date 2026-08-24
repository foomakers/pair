# Decision: Coverage baseline commit-back writes a bot PR from the post-merge run — never a push to the protected base, never the PR branch

## Date

2026-07-30 (amended 2026-08-24)

## Status

Active (amended 2026-08-24 — WHERE the ratchet lives and HOW it is invoked changed with [ADR-022](../tech/adr/adr-022-coverage-ratchet-exposed-through-the-cli.md); every decision below about WHAT it does — PR-not-push, the credential model, loop termination, monotonicity — is unchanged)

## Category

Process Decision

## Context

Story #282 shipped the coverage guardrail with an explicitly **advisory** persistence model: `coverage-gate.sh` prints a suggested `baseline.<type>=NN` to stderr and a human commits it. Story #372 adds the opt-in automation, and its AC5/AC6 force two decisions that cannot be left implicit:

1. **Does a pull-request run write back, or only the post-merge run on the base branch?**
2. **With what credential?**

Both must be decided against the **post-#234 regime**, not against today's unprotected `main`. Story #234 (PR #390, parked open) makes `pair-review` and `pair-explicit-approval` **required status checks** on `main` and sets **`enforce_admins: true`** (ADR-018, which lands with that story — not linked here because this decision precedes its merge). Under that regime:

- **A direct push to `main` is structurally impossible for CI.** Required status checks are evaluated on pushes to a protected branch, not only on merges; `enforce_admins: true` removes the admin escape hatch. A commit pushed by a workflow will never carry a `pair-explicit-approval` context — that context is produced by a *human* approving a PR (adr-018 pins it to `pull_request.head.sha`). So the "simplest" option in the story body — defer to the post-merge run and push — is not merely awkward after #390, it is **rejected by the host**.
- **Writing to the PR branch mutates `head.sha`**, which is exactly the commit both required contexts are pinned to. A raise would therefore invalidate a human approval that had already been given, forcing a re-approval on every coverage improvement — the automation would consume the very control #234 introduces.
- **A fork PR has no write access at all** (`GITHUB_TOKEN` is read-only on `pull_request` from a fork), so a PR-branch write is not uniformly available anyway.
- **`GITHUB_TOKEN` cannot open a PR that CI will run.** Events triggered by `GITHUB_TOKEN` do not start new workflow runs, so a PR opened with it would sit forever with `CI` and `pair-review` **pending** — un-mergeable under the same required-check regime.

## Decision

**AC5 — PR vs. push: neither. The write-back happens only on the post-merge `push` run on the base branch, and it lands as a bot-authored pull request, not as a push to the base branch.**

- A `pull_request` run **never** writes. The skip predicate refuses any event that is not a `push` whose ref is the configured base branch (skip code `not-base-push`). This is uniform for fork and same-repo PRs — no fork special case, no head-SHA mutation, no invalidated approval.
- The post-merge run computes the raise, commits it **on the checked-out base commit without creating or switching to any local branch**, pushes that commit by explicit refspec to a dedicated remote branch `chore/coverage-baseline-ratchet` (`HEAD:refs/heads/chore/coverage-baseline-ratchet`, `--force-with-lease`), creates-or-updates **one** PR from it, and then resets the checkout back to the SHA it was given — the later steps of the same job must find the workspace they were handed, not a bot branch. That PR goes through the *same* protection the regime requires: CI runs, `pair-review` reports, a human approves. Nothing bypasses branch protection and no exemption/bypass allowance is requested — which is the point: #234 exists to make `main` unwritable except through review, and an automated coverage bump is not a reason to punch a hole in it.
- **The lease is made to work, not assumed.** `--force-with-lease` needs a remote-tracking ref for the destination, and a CI checkout has none for the ratchet branch (it fetches the base ref only, and the clone's fetch refspec does not map anything else). Verified empirically: without one, git rejects every non-fast-forward lease push as `stale info` — the ratchet would land its first raise and then warn forever. So the plan adds a fetch refspec for the ratchet branch and fetches it (tolerating the failure on the first run, when the branch does not exist yet) *before* pushing. A bare `--force` was rejected: the branch is bot-owned, but a force push should still be the kind git can refuse. Note what does **not** rest on the lease — never clobbering a higher baseline is a data-level guarantee (`applyRaises` re-reads the config and re-checks each proposal), not a push-level one.
- **Automated, not manual, in the sense the story asks for**: nobody has to *remember* to bump the file or *measure* anything — the raise arrives as a reviewable PR. What stays human is the one irreducible act the protection regime mandates: approving a change to `main`.

**Credential model — a dedicated, repo-scoped, non-bypassing token, and its absence is a warning.**

- The step reads `COVERAGE_RATCHET_TOKEN`: a **fine-grained PAT (or GitHub App installation token) scoped to this repository only**, with exactly two permissions — `contents: write` (to push the `chore/coverage-baseline-ratchet` branch) and `pull requests: write` (to open/update the ratchet PR). **No** `administration` scope, and the token holder is **not** added to any branch-protection bypass list.
- **Least privilege in the event dimension as well**: the workflow binds the secret to `push` on the base branch, so a `pull_request` run — the one whose diff can influence what the job executes — never has the token in its environment at all. That is belt; the module's `not-base-push` skip is braces.
- `GITHUB_TOKEN` is deliberately *not* used, for a functional reason rather than a scope one: a PR it opens gets no workflow run, so it can never satisfy the required contexts.
- The workflow's default token permissions are unchanged (the repo does not grant job-wide write); the ratchet's credential enters through a single `env:` on a single step.
- **Missing/insufficient credential is a refusal, not a failure** (AC6): the step emits `::warning::` naming the reason and exits 0. It runs *after* the guardrail step and never touches the gate's exit code, so a persistence failure can neither redden a green gate nor green a red one.

**Loop termination (AC4) is a predicate plus a fixpoint, not a `[skip ci]`.**

- The skip predicate refuses a run whose head commit message carries the marker `[coverage-baseline-ratchet]` (skip code `automated-commit`). The marker is placed in the **PR title** as well as the commit subject, so it survives a squash merge (whose subject defaults to the PR title); the ratchet **branch name** is accepted as a second marker so a plain merge commit (`Merge pull request #N from chore/coverage-baseline-ratchet`) is also caught.
- Independently, the ratchet is a **fixpoint**: the value it writes is `floor(measured) - 1pp`, so re-running on the same coverage proposes the value already committed and produces no raise. Termination therefore does not depend on the marker surviving — that is belt, this is braces. `[skip ci]` was rejected as the mechanism: it suppresses the whole pipeline, including the very gates the ratchet PR must satisfy under #234.

**Ratchet semantics.** Monotonic — the writer only ever raises a `baseline.<type>` value in place, never lowers or reorders, and never rewrites the surrounding markdown. The margin (`floor(measured) - 1`) is not a new convention: it is the one `tech/coverage-baseline.md` already documents and reproduces exactly (85.04 → 84, 20.16 → 19). Concurrency: the config is re-read from disk immediately before the write and each proposal re-checked for a strict raise, so a higher value written by another run is never clobbered.

**Framework default stays `disabled`**, and **pair itself stays `disabled`** for now: enabling it before #390 lands and before `COVERAGE_RATCHET_TOKEN` is provisioned would only produce a warning on every push. The flag is a one-word edit in `way-of-working.md` when both are true.

## Alternatives Considered

- **Post-merge direct push to the base branch (the story body's "simplest, protection-compatible" option)**: Rejected. It is *not* protection-compatible after #234 — required status checks apply to direct pushes and `enforce_admins: true` leaves no bypass; the pushed commit can never carry `pair-explicit-approval`. Making it work requires a bypass allowance for the ratchet identity, i.e. a permanent write path into `main` that skips review — precisely the hole #234 closes.
- **Write to the PR branch during the PR run**: Rejected on three counts: no write access on fork PRs; mutating `head.sha` invalidates the `pair-review`/`pair-explicit-approval` contexts pinned to it, so every coverage improvement would silently revoke a human approval; and two concurrent PRs both raising the same key conflict in the config file.
- **Ratchet PR opened with the default `GITHUB_TOKEN`**: Rejected. Events from `GITHUB_TOKEN` do not trigger workflows, so the PR would never obtain the required `CI`/`pair-review` contexts and would be un-mergeable — an automation that reliably produces a stuck PR.
- **`[skip ci]` in the automated commit as the loop guard**: Rejected. It skips the whole pipeline, so the ratchet PR would never get the checks #234 requires; and it guards the wrong thing (the coverage job is what must be skipped, not the build).
- **Keep #282's advisory model and do nothing** (`disabled` forever): Rejected as the *shipped capability* — it is, however, exactly what the default and pair's own current flag state give, so nothing regresses for adopters who never opt in.
- **Persist the baseline from inside `coverage-gate.sh`**: Rejected, unchanged from #282. The gate decides pass/fail and must stay a pure reader; persistence is a separable side effect that is allowed to fail alone (and per the gate-tooling ADL its logic belongs in a tested module, not in the shell asset).

## Consequences

- `coverage-gate.sh` is untouched in behaviour: it still never persists. Only its PERSISTENCE comment is updated to point at the new, decided model instead of "tracked separately".
- The ratchet logic lives in a unit-tested, white-box module per [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md); the CI step is a thin entrypoint, and the CLI is verified end-to-end by the `coverage-gate.sh` smoke scenario (dry-run), never by a unit test. **Amended 2026-08-24** ([ADR-022](../tech/adr/adr-022-coverage-ratchet-exposed-through-the-cli.md)): that module was `packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts`, runnable only as `pnpm --filter @pair/knowledge-hub coverage:ratchet` — i.e. only inside this repository. It is now `apps/pair-cli/src/commands/coverage-ratchet/ratchet.ts` behind the shipped `pair-cli coverage-ratchet` command, which pair's own CI step and an adopter's generated step both invoke. The module/entrypoint split this bullet asserts is unchanged; what changed is that the entrypoint is now reachable by anyone who installed the CLI. The git/gh command sequence is data (a plan the module returns), so its non-negotiable properties — one push, to the ratchet ref only, leaseable, no `git add -A`, no branch switch, always restored — are asserted by tests rather than reviewed by eye in YAML.
- Adopters who enable the flag must provision `COVERAGE_RATCHET_TOKEN`; without it the step warns on every base-branch push. Documented on the adoption line and in the KB guideline, not only in the workflow YAML.
- A merged ratchet PR produces a base-branch push whose subject carries the marker, so the next run skips — and even without the marker the fixpoint yields no raise. Both are demonstrated in the smoke scenario.
- One extra open PR may exist at a time (`chore/coverage-baseline-ratchet` is create-or-update, never a second PR per raise).

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): the existing **Coverage guardrail** bullet under Quality Gates gains the `Coverage baseline commit-back: disabled` sub-flag, its default, the token requirement and a pointer here. Edited surgically (that bullet only) because the file is contended by parked PRs #389/#390.
- [tech/coverage-baseline.md](../tech/coverage-baseline.md): the "Human-committed" note is amended to describe the opt-in ratchet and the margin rule the writer reproduces.
- [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md) (+ dataset twin): the coverage-guardrail subsection's commit-back sentence replaces "tracked separately — see story #372" with the decided model, the flag, the default and the credential requirement. Surgical for the same reason (contended by #390).
- [coverage-config-example.md](../../knowledge/assets/coverage-config-example.md) (+ dataset twin): the "tracked separately — see story #372" sentence is replaced by the decided model, so the shipped config documentation no longer points at an open question.
- **Deliberately deferred**: the sub-flag is NOT added to the shipped `dataset/.pair/adoption/tech/way-of-working.md` template, because that file is contended by two parked PRs (#389, #390) and a template line is not worth a merge conflict. Nothing depends on it: an **absent** flag reads as off (`readCommitBackFlag` → `absent` → `flag-disabled`, unit-tested), which is exactly the framework default, and the KB guideline already documents the flag, its default and its credential where an adopter reads them. Adding the template line is a one-line follow-up once those PRs land.
- No dataset mirror for this ADL: `adoption/decision-log/` is an adoption-only record (same rationale as the sibling ADLs).
