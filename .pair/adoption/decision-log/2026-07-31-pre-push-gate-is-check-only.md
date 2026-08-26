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

Observed **three times in two days** on this repo, on the same two `pair-cli` version-check test files, each time because the hook reformatted files the author never touched:

- **PR #388** (story #281, `feature/US-281-assess-cost-report-mode`) was pushed with `--no-verify` after the hook rewrote them;
- the same two files were then swept into **PR #411** (story #407, `chore/US-407-preserve-nested-references-subdir`) by a `git add -A` and had to be reverted;
- and excluded by hand from **PR #408** (story #278, `feature/US-278-quickstart-bootstrap-path`).

The escape hatch is `--no-verify`, and once bypassing is routine the hook asserts nothing at all.

A second failure mode surfaced while implementing this: generated artifacts. In write mode, generated trees (`.source/`, `playwright-report/`, `test-results/`) were silently rewritten on every push. In **check** mode the same trees would **block** every push — a generated file must be able to do neither, so "gitignored ⇒ never formatted/checked" becomes a correctness requirement rather than a nicety.

## Decision

**Formatters run in check mode inside the gate; formatting is applied deliberately, by the developer, as a commit.**

- `pnpm format:check` is what the gate runs. It is the only formatting step reachable from `quality-gate`. It **aggregates** rather than short-circuits (`pnpm prettier:check; _p=$?; pnpm mdlint:check; _m=$?; exit $((_p > 1 || _m > 1 ? 2 : (_p || _m)))`): with `&&`, a single prettier violation hid every markdownlint violation in the tree, so a contributor with both kinds of drift paid two push cycles — push fails → `pnpm format` → push → fails again on markdown. One run now names everything to fix. Verified with a deliberate violation of each kind: the `&&` form reported only the prettier one. The aggregation preserves the DISTINCTION between a violation and a broken tool: either checker exiting above 1 (a wrapper that died — e.g. an unresolved `@pair/prettier-config` after a partial install) surfaces as exit **2**, not as the 1 that means "run `pnpm format`". Collapsing both to 1 would send a contributor to the fix command for a failure the fix command cannot touch.
- `pnpm format` (= `pnpm prettier:fix && pnpm mdlint:fix`) is the write-mode command a developer runs when the check fails. Both compose the existing root scripts rather than re-typing their bodies, so check and fix cover the same file set by construction (including root-level `*.md`, which only the root `mdlint:*` scripts reach — `turbo` runs tasks in workspace members only).
- The gate is guarded against regression by `pnpm gate:composition` → `packages/dev-tools/src/quality-gates/pre-push-gate-composition.ts`, which reads the real root `package.json`, **expands runner references transitively** (`pnpm x`, `pnpm run x`, flagged forms like `pnpm -s x`, and the `npm run` / `yarn` spellings — a single token between the runner and the script name would otherwise defeat the expansion), and fails if any write-mode formatter is reachable from `quality-gate`. The guard must survive the indirection (`pnpm format:check`), because the likeliest regression is a one-word edit (`pnpm format`) or a redefinition of `format:check`. The offender list is **symmetric across the tools** — turbo task, `bin` alias / `.sh` entrypoint, and the raw CLI with its write flag (`prettier --write`, `markdownlint --fix`, `eslint --fix`) — since a list covering one tool's shell form and not the other's leaves an equally plausible regression shape open. The **intended** invariant is "no step reachable from the gate writes files", not merely "no write-mode *formatter*", and the offender list is widened to match it beyond the formatters: eslint's autofix (`lint:fix` → `eslint . --fix`), plus the two root scripts this repo already defines whose job IS to write — `sync-version` (→ `sync-version-in-docs.ts`, `writeFileSync` across every `.md`/`.mdx` it walks; its `--check` dry-run is spared, bounded to the same command segment) and `test:perf` (→ `benchmark-update-link.ts`, a scratch KB tree plus `reports/performance/benchmark-report.json`, no dry-run, banned outright). Nothing in the gate runs any of them today — which is when widening a guard is free. It also fails if the gate stops *running* the guard (a mention such as `echo gate:composition` does not count), or if the remedy it advertises (`pnpm format`) ceases to exist.

  **What is actually enforced is that explicit list, not the invariant in general.** A newly added, differently named writer — or one reached through a package script, whose body the guard never reads — passes green and is caught by review, not here. The list is deliberately explicit rather than a `/:fix/`-style pattern: a guard that fires on strings it has no opinion about gets disabled. So "add the write script to `WRITE_MODE_FORMATTERS`" is part of adding a write script to this repo.
- Both formatter wrappers (`tools/prettier-config/bin/*`, `tools/markdownlint-config/bin/*`) additionally honour the repo's own `.gitignore` files (repo root + the package being checked), so gitignored/generated output is never formatted and never blocks a push — without enumerating generated directories reactively. The ignore assembly lives in ONE sourced helper per tool (`bin/_ignore-args.sh`, `bin/_ignore-file.sh`), because check and fix seeing the same file set is an invariant and duplication is how it drifts (`dup:check` scans TypeScript only, so shell drift is invisible to it).
- The two tools resolve those patterns against different bases, so the root `.gitignore` is **re-anchored to the cwd for markdownlint** (`bin/_reanchor-gitignore.awk`): prettier resolves each ignore file's patterns against that file's directory — git semantics — while markdownlint-cli resolves them against the cwd, which would make a path-anchored entry (`apps/website/gen/`) match nothing from inside that package and block every push from it.

## Alternatives Considered

- **lint-staged / pre-commit auto-fix** (the alternative the story offered): a pre-*commit* hook formatting only staged files *would* be correct in principle — the fix lands in the commit being created. Rejected for now: it adds a dependency and a second hook, moves the failure earlier into every commit (this repo commits per task, often mid-work), and cannot cover the "already committed, about to push" case the gate exists for. Check mode at pre-push achieves the goal (no unrelated rewrite, violations still fail before push) with no new tooling. Revisitable as its own story if manual `pnpm format` proves annoying in practice.
- **Keep write mode, restrict it to changed files**: rejected. Still cannot fix the commits being pushed, and computing "changed files" at pre-push means the diff against the upstream ref — logic the hook does not have and that varies by push shape.
- **Drop the formatters from the gate entirely**: rejected. That silently removes the assurance; a formatting violation in a changed file would reach CI (where no `format:check` job exists) unnoticed.
- **Enumerate generated directories in the shared ignore files**: rejected as the primary mechanism. It is reactive — each new generated tree blocks a push until someone adds a line — and it was already the cause of two blocked pushes here. Delegating to `.gitignore` makes the rule declarative.
- **A comment/doc line saying "don't put `:fix` in the gate"**: rejected as the only safeguard. The regression is one word and its symptom (a diff full of unrelated files) reads as author error, not tooling behaviour; the executable guard is what makes it non-silent.

## Resolved Decision (2026-08-05) — neither A nor B; a dedicated command instead

**Decided by the maintainer on 2026-08-05. Tracked as story #419.** Both shapes below were declined as written, for reasons that only became visible when the actual remedy command was inspected.

**The remedy was naming the wrong command.** `PRE_PUSH_REMEDY`, `DEVELOPMENT.md` and its docs-site twin all say `pair update` — which `DEVELOPMENT.md` itself documents as *"Update knowledge base to latest version"*. That resolves and installs the **published** KB; what a mirror divergence needs is regeneration **from the local dataset** (`pair update --source <local dataset>`, the form `CP3` and the `source-resolution` smoke scenario already exercise). So the documented fix for a reformatted table was a knowledge-base update — disproportionate and non-deterministic, and the most plausible explanation for why three of the seven incidents were hand-ports: a contributor faced with that command reasonably chose to edit the mirror instead.

**Why A was declined**: a hook that writes files the contributor never staged is the symptom this story removed, and at pre-push the fix cannot reach the commits being pushed — it saves a keystroke, not a cycle.

**Why B was declined**: `pair update` is an install command. Folding it into `pnpm format` would let every formatting run change the knowledge base, and would make `format` write outside format scope. (With `--source` the "newer version" risk disappears, but the scope violation does not.)

**What was decided instead** — three parts, all in #419:

1. **A dedicated, explicit command** that regenerates the mirrors from the local dataset only. Deterministic, idempotent, no version resolution.
2. **The gate names that command** in its remedy, in all three places, replacing `pair update`.
3. **`/pair-capability-publish-pr` runs it** and commits the output as its own commit — PR creation is the latest point at which regenerated output can still enter the branch, and it is an explicit, tracked act rather than a hook side effect.

**`pnpm format` stays formatting**, and the gate stays check-only. Both invariants of this ADL survive intact.

This also becomes load-bearing once **#414** lands: with the mirrors inside `format:check` scope, a contributor without this command would be pushed toward hand-formatting a generated file — which the mirror guards forbid.

### Original framing (kept for the record)

**Should the gate apply the fix as well as failing, and should `pnpm format` realign the generated mirrors?** Raised by the maintainer 2026-08-04 while reviewing this story; deliberately not implemented at the time, and not to be implemented without their call.

What is settled: the gate **fails** on a formatting violation. That was the story's point, and it holds — before this change `prettier:fix` corrected the files, exited 0 and let the push through, so nothing failed except in the one sub-case where the fix touched `dataset/.skills/**` and `skills:conformance` then compared dataset against mirror.

What is open, and the two shapes it could take:

- **A — the gate applies the fix, then still fails** (`pnpm format || true` before `format:check`). The contributor only has to commit. Cost: a hook writes files the contributor never staged, which is the symptom that motivated this story ("a diff full of unrelated files"), and at pre-push the fix cannot reach the commits being pushed — so it saves a command, not a cycle.
- **B — `pnpm format` also runs `pair update`**, so the command that reformats the dataset realigns `.claude/skills/**` and `.pair/**` in the same step. It closes the residual manual step (the two-step remedy nobody remembers) but couples a formatting command to an install command and makes `format` write outside format scope.

Why it matters enough to record rather than leave implicit: the divergence this is about bit **seven times in one day**, three of them because a mirror was hand-ported instead of regenerated. The current state is safe — the mirror guard runs first in the gate and catches it with the right message — but the remedy is still a human remembering `pair update`.

Not scoped, not estimated, no story. Escalate to the maintainer first.

## Consequences

- `pnpm quality-gate` no longer modifies the working tree. A formatting violation in a changed file still fails the push, with `pnpm format` named in the failure message.
- Contributors must run `pnpm format` themselves after a `format:check` failure; documented in [DEVELOPMENT.md](../../../DEVELOPMENT.md) (Quality Gates + Root-Level Commands) **and in the published copy** `apps/website/content/docs/contributing/development-setup.mdx`, which restates the same gate description for the docs site. The two copies are hand-kept: `docs:staleness` checks skill/CLI counts and dead `/docs` links only, and `format:check` does not read `apps/website/content` prose — so any future change to the gate's composition has to touch both files. To make the next divergence visible, the load-bearing paragraph (gate list + "never formats" + two-step remedy) is kept **byte-identical between the two files except for the ADL link form** (relative path vs GitHub blob URL) — a `diff` of the two paragraphs is therefore a one-line diff when they are in sync, which a hand-kept pair that starts life already unequal never gives you. The claim is scoped to that paragraph on purpose: the surrounding root-command blocks legitimately list different commands (the contributor page omits the release ones), so demanding byte-equality there would make the drift signal report three lines on a pair that IS in sync — which is how a reader learns to ignore it.
- The hop count from `packages/dev-tools/src/quality-gates/` to the repo root lives in one module (`repo-root.ts`), imported by all four gate tools in that folder — it had drifted into four copies of the same `resolve(__dirname, '..', '..', '..', '..')`, which is the duplication ADR-014 records as already broken once by a folder move.
- The guard (`gate:composition`) runs inside the gate, and its unit test asserts the real root `package.json` — so removing the guard from the gate fails the test suite that the gate itself runs.
- The new gate tool follows the ADR-014 shape shared by its siblings in `packages/dev-tools/src/quality-gates/`: an importable, unit-tested module plus `main()` behind a `require.main === module` guard (no separate `-cli.ts`).
- The wrappers' ignore delegation — which the guard cannot see, since it inspects `package.json` scripts only — is covered by the `format-ignore-delegation.sh` smoke test (both tools, check and fix, inside a throwaway git repo with its own prettier config so discovery cannot escape the fixture), per the gate-tooling ADL (2026-07-13): script/CLI surfaces are verified by smoke test, not by unit test. The check-mode half asserts **exit status** (1 = violations, anything else = broken wrapper) and the absence of tool-error output, because both tools name the offending path inside their own error text — a text-only assertion passes on a wrapper that died. The re-anchoring awk is covered table-driven in the same scenario (one fixture `.gitignore`, three cwd positions), since its branches fail as a silent OVER-ignore rather than an error.
- `turbo.json` declares the ignore sources as `globalDependencies` (root `.gitignore`, the shared ignore files, both `bin/` dirs). The formatter tasks are cacheable, so without it an edit to `.gitignore` touches no package file and turbo replays a pre-change result — a stale PASS, or a stale FAIL a developer cannot clear.
- Enforcement point is the local hook only. CI runs `lint` and coverage but no `format:check`, and `--no-verify` still skips the hook — deliberately unchanged here (CI workflow changes are out of scope for #394). Tracked as story **#413**.
- `format:check` covers workspace packages plus root-level `*.md` only: `.pair/**`, `scripts/**` and root-level JSON are checked in neither mode (pre-existing, unchanged here). Tracked as story **#414**.
- **The remedy is two-step for one file set, because format scope and mirror scope disagree.** `packages/knowledge-hub/dataset/.skills/<cat>/<name>/SKILL.md` IS in format scope (workspace package); its generated twin `.claude/skills/pair-<prefixed>/SKILL.md` is NOT (`.claude/` is not a workspace member — `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `tools/*`, and the root `mdlint:check` extra step globs a non-recursive `'*.md'`). Meanwhile `packages/knowledge-hub/src/tools/skill-md-mirror.ts` asserts the two are byte-equal by regenerating the `.claude` copy through the real `pair update` transform. So a format-only edit to the dataset copy turns a green `format:check` into a red `skills:conformance` **later in the same gate**, and a contributor following "run `pnpm format`" alone lands back on `--no-verify`. The mechanism pre-dates #394 (the old gate ran `mdlint:fix` in-gate, hiding it), but this decision promotes `pnpm format` to the documented happy path, so the two-step remedy — re-sync the `.claude/skills/**` copies with `pair update` in the same commit — is stated in all three places that advertise the remedy: `DEVELOPMENT.md`, the `development-setup.mdx` twin, and `PRE_PUSH_REMEDY` (unit-tested). Hit for real on this branch: clearing main's MD049 drift in `assess-cost/SKILL.md` broke the mirror guard until the twin was propagated. The **structural** fix is bringing both copies into one format scope — noted on story **#414**, whose body lists `.claude/**/*.json` but neither `.claude/skills/**/*.md` nor this mirror-guard coupling.
- Framework-scope guidance (`.pair/knowledge/.../quality-gates.md`) showed `prettier:fix` as the example gate command; corrected here to `format:check` with the reason stated in the cell, which closes the framework half of #415. The **bootstrap dataset template no longer does** — `dataset/.pair/adoption/tech/way-of-working.md` was corrected in this story (gate line + Custom Gate Registry row, the row also promoted to `Required: Yes`, since a check that neither fixes nor blocks is weaker than the auto-fixer it replaced). So a newly bootstrapped project no longer inherits the anti-pattern — neither in its own adoption file nor from the framework example. #415 is closed by this story. Promoting this project decision to framework guidance is a separate, framework-audience decision; tracked as story **#415**.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): Quality Gates section — the gate contents bullet names `format:check` + `gate:composition`, plus a short "formatters never run in write mode" bullet pointing to this ADL; the Custom Gate Registry row for gate 1 describes it as "formatting check (never fix)".
- [tech-stack.md](../tech/tech-stack.md): the markdownlint entry notes the gate reaches `mdlint:check` only, `mdlint:fix` being reachable through `pnpm format`.
- **This ADL** has no knowledge-base/dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records (see [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md)), and the decision is project-level. That is about the *record*, not about its reach: the shipped **template** was corrected here (above), because a template telling adopters their gate runs a write-mode formatter propagates the defect regardless of where the decision is recorded. Promoting the *rationale* into framework guidance stays a separate, framework-audience call.
