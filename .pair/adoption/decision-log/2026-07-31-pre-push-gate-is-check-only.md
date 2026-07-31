# Decision: The pre-push quality gate checks formatting; it never applies it

## Date

2026-07-31

## Status

Active

## Category

Convention Adoption

## Context

The husky **pre-push** hook runs the repo-root `quality-gate` script, which included `turbo prettier:fix mdlint:fix` plus `markdownlint-fix.sh '*.md'` — repo-wide formatters in **write** mode.

The decisive problem is not noise, it is uselessness: **at pre-push the commits already exist**. A write-mode formatter rewrites the *working tree* and cannot touch what is being pushed, so its output goes nowhere unless the author notices and amends. Repo-wide, it also rewrites files the author never touched.

Observed twice in one day on this repo (stories #384, #401): a push reformatted unrelated files, which then either got swept into the next commit — polluting an unrelated PR diff — or forced the author to `git checkout` them. The escape hatch is `--no-verify`, and once bypassing is routine the hook asserts nothing at all.

A second failure mode surfaced while implementing this: generated artifacts. In write mode, generated trees (`.source/`, `playwright-report/`, `test-results/`) were silently rewritten on every push. In **check** mode the same trees would **block** every push — a generated file must be able to do neither, so "gitignored ⇒ never formatted/checked" becomes a correctness requirement rather than a nicety.

## Decision

**Formatters run in check mode inside the gate; formatting is applied deliberately, by the developer, as a commit.**

- `pnpm format:check` (= `pnpm prettier:check && pnpm mdlint:check`) is what the gate runs. It is the only formatting step reachable from `quality-gate`.
- `pnpm format` (= `pnpm prettier:fix && pnpm mdlint:fix`) is the write-mode command a developer runs when the check fails. Both compose the existing root scripts rather than re-typing their bodies, so check and fix cover the same file set by construction (including root-level `*.md`, which only the root `mdlint:*` scripts reach — `turbo` runs tasks in workspace members only).
- The gate is guarded against regression by `pnpm gate:composition` → `packages/dev-tools/src/quality-gates/pre-push-gate-composition.ts`, which reads the real root `package.json`, **expands `pnpm <script>` references transitively**, and fails if any write-mode formatter is reachable from `quality-gate` — the guard must survive the indirection (`pnpm format:check`), because the likeliest regression is a one-word edit (`pnpm format`) or a redefinition of `format:check`. It also fails if the gate drops the guard itself, or if the remedy it advertises (`pnpm format`) ceases to exist.
- Both formatter wrappers (`tools/prettier-config/bin/*`, `tools/markdownlint-config/bin/*`) additionally honour the repo's own `.gitignore` files (repo root + the package being checked), so gitignored/generated output is never formatted and never blocks a push — without enumerating generated directories reactively.

## Alternatives Considered

- **lint-staged / pre-commit auto-fix** (the alternative the story offered): a pre-*commit* hook formatting only staged files *would* be correct in principle — the fix lands in the commit being created. Rejected for now: it adds a dependency and a second hook, moves the failure earlier into every commit (this repo commits per task, often mid-work), and cannot cover the "already committed, about to push" case the gate exists for. Check mode at pre-push achieves the goal (no unrelated rewrite, violations still fail before push) with no new tooling. Revisitable as its own story if manual `pnpm format` proves annoying in practice.
- **Keep write mode, restrict it to changed files**: rejected. Still cannot fix the commits being pushed, and computing "changed files" at pre-push means the diff against the upstream ref — logic the hook does not have and that varies by push shape.
- **Drop the formatters from the gate entirely**: rejected. That silently removes the assurance; a formatting violation in a changed file would reach CI (where no `format:check` job exists) unnoticed.
- **Enumerate generated directories in the shared ignore files**: rejected as the primary mechanism. It is reactive — each new generated tree blocks a push until someone adds a line — and it was already the cause of two blocked pushes here. Delegating to `.gitignore` makes the rule declarative.
- **A comment/doc line saying "don't put `:fix` in the gate"**: rejected as the only safeguard. The regression is one word and its symptom (a diff full of unrelated files) reads as author error, not tooling behaviour; the executable guard is what makes it non-silent.

## Consequences

- `pnpm quality-gate` no longer modifies the working tree. A formatting violation in a changed file still fails the push, with `pnpm format` named in the failure message.
- Contributors must run `pnpm format` themselves after a `format:check` failure; documented in [DEVELOPMENT.md](../../../DEVELOPMENT.md) (Quality Gates + Root-Level Commands).
- The guard (`gate:composition`) runs inside the gate, and its unit test asserts the real root `package.json` — so removing the guard from the gate fails the test suite that the gate itself runs.
- The new gate tool follows the ADR-014 shape shared by its siblings in `packages/dev-tools/src/quality-gates/`: an importable, unit-tested module plus `main()` behind a `require.main === module` guard (no separate `-cli.ts`).
- Enforcement point is the local hook only. CI runs `lint` and coverage but no `format:check`, and `--no-verify` still skips the hook — deliberately unchanged here (CI workflow changes are out of scope for #394); a CI `format:check` job is a candidate follow-up story.
- Framework-scope guidance (`.pair/knowledge/.../quality-gates.md`) still shows `prettier:fix` as an example gate command. Promoting this project decision to framework guidance is a separate, framework-audience decision; not done here.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): Quality Gates section — the gate contents bullet names `format:check` + `gate:composition`, plus a short "formatters never run in write mode" bullet pointing to this ADL; the Custom Gate Registry row for gate 1 describes it as "formatting check (never fix)".
- [tech-stack.md](../tech/tech-stack.md): the markdownlint entry notes the gate reaches `mdlint:check` only, `mdlint:fix` being reachable through `pnpm format`.
- No knowledge-base/dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records (see [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md)), and this is a project-level decision, not framework guidance.
