---
name: pair-capability-verify-quality
description: "Checks whether the codebase passes the quality gates the CI pre-merge gate would run for the item/PR risk tier — resolves the `risk:*` tag, applies the KB gate matrix (🟢 lint+type+build; +unit from 🟡; +integration/E2E on 🔴), and reports pass/fail per gate so local verification mirrors CI for the tier check set (tier-check parity, no over-checking on green work; the coverage-guardrail and secret-scan CI layers are NOT mirrored locally). Fail-safe red when untagged. Skips gates already passing. Composed by /pair-process-implement and /pair-process-review; invoke directly before pushing."
version: 0.7.0
author: Foomakers
---

# /pair-capability-verify-quality — Quality Gate Checker

Validate the current codebase against the quality gates **the CI pre-merge gate would run for this item/PR's risk tier** — so local verification mirrors CI (local = CI): no surprise reds at the gate, no over-checking on 🟢 green work.

Three sources of truth:

- **[way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)** — project-specific quality gate command and process (e.g., `pnpm quality-gate`), plus the `Pre-merge tiering` flag. This is "what commands we run and how."
- **[quality-model.md §4](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md)** — the tier→checks matrix, the **single source** of which checks each tier runs. This is "which gates for this tier."
- **[tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md)** — the delivery-side wiring the CI gate is generated from; this skill reuses its shipped [`tier-resolve.sh`](../../../.pair/knowledge/assets/tier-resolve.sh) helper so local and CI resolve the tier and its suites through the **same** code.

**verify-quality contains NO classification criteria: it reads the `risk:*` tag and the KB gate matrix (D18)** — the same single source the pipeline reads. It never inspects the diff, the code, file paths, or change size to decide a tier. The matrix decides WHICH gates run; adoption (`way-of-working.md`) decides HOW they run (the gate commands). Tags are produced upstream by `/pair-capability-classify` and carried on the story/PR.

Only check gates that are **not already passing** (idempotency preserved).

**Read-only, with one exception**: every gate only runs existing commands and modifies nothing — except **Step 5.C** (first-time custom-gate setup), the skill's ONLY write, which on a first run with no Custom Gate Registry writes the registry table or an opt-out marker to way-of-working.md (once).

## Arguments

| Argument | Required | Description                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `$scope` | No       | Limit checking: `code-quality`, `tests`, `lint`, `all`, or any custom scope key from adoption (default: `all`) |
| `$pr`    | No       | A **PR identifier** naming **which PR** the tier is resolved from — a bare number (`420`), the `#420` spelling this corpus writes PR references in, or a URL carrying a `pull/<n>` segment (GitHub/Bitbucket `pull-requests/<n>`, GitLab `merge_requests/<n>`), with or without a trailing path or fragment (`…/pull/420`, `…/pull/420/files`, `…/pull/420#issuecomment-9`). Step 1.5 normalizes it to `<n>`, so every report row and reason renders `PR #N`; an identifier in no recognized form is echoed verbatim rather than dropped. Its `risk:*` labels are read from the **code host** — the same source CI gates on, review-raised (D17) tags included. It names the PR; **the tier is read, never carried** across the boundary, so there is no second source of truth and no widen-only guard of its own. Pass it when the invocation is **not** on that PR's branch (how `/pair-process-review` composes this skill). **Optional and additive**: for callers that omit it the composition **contract** is unchanged — same PASS/FAIL shape, same resolution precedence — with one added code-host read (Step 1.5 point 1's tier-independent `Tree:` row, one round trip per run, **skipped** when the repo has no code-host remote). |
| `$story` | No       | A **story id**, used only for the pre-publish story-card fallback (Step 1.5) when the branch has no PR yet. With no `$pr`, the tier comes from the **current-branch PR** — `gh pr view` with no argument resolves it (the branch resolves its own PR, and its labels are authoritative). Pass `$story` only to name the story card to read before a PR exists. |

`$scope` and the resolved tier compose: the tier decides the widest set CI would run; `$scope` may narrow within it (e.g. `$scope=lint`). `$scope` never *widens* past the tier. **Empty intersection is a no-op, not a failure**: if `$scope` selects a check the tier doesn't run (e.g. `$scope=tests` on 🟢 green, whose active test set is empty), the intersection is empty — that gate runs nothing and reports `SKIPPED (tier)`, never a FAIL and never a widen.

## Algorithm

Execute each gate in order. For every gate, follow the **check → skip → act → verify** pattern.

### Step 1: Read Adoption Quality Gate Configuration

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and look for a **Quality Gates** section declaring the project-specific quality gate command (e.g., `pnpm quality-gate`).
2. **Skip**: If `way-of-working.md` has no Quality Gates section, fall back to `package.json` scripts for detectable gate commands (e.g., `test`, `lint`, `ts:check`).
3. **Act**: If found, record the command for use in Step 5. Also note any sub-checks listed (e.g., type checking, testing, linting, formatting).

### Step 1.5: Resolve the Tier Gate Matrix (CI parity)

This step decides **which** suites the standard gates below run, so the local run matches what CI would run for this item/PR. It reads tags + the matrix only — no classification.

1. **Act — which code do the suites run against? (tier-independent, always, on BOTH resolution paths).** The tier and the tree are two different questions and only the first depends on tiering, so resolve the tree **before** the flag is read: the report's `Tree:` row — and the caller rule keyed on its **resolved value** (`/pair-process-review` Step 2.1 treats only `match` as authoritative) — must exist in **every** configuration, `Pre-merge tiering: disabled` (the default) included, and for the PR named by `$pr` as well as the checked-out branch's own PR (one read serves both). Otherwise a run from an unrelated checkout reports green gates with nothing saying which code they ran on. **Cost, stated as it is paid:** one code-host round trip **per run** — nothing is remembered between runs, so a caller that gates once per task (`/pair-process-implement`) pays it once per task. It is **skipped** when the repo has no code-host remote, and degrades to `Tree: unknown` — which changes no gate — when the host is unreachable; on a host command with no request-timeout knob (GitHub's `gh` has none) that degradation costs the command's own default timeout, on every run. A session that must work **offline or rate-limited against a configured remote** installs a fail-fast `pr_view_json` override before sourcing the asset (the documented code-host substitution point) — that is the only mitigation there is; never assume a read that already failed will be skipped for you. (The full argument for this trade-off, and for each rule below, lives in the project's decision log; this step carries the rule.)

   ```bash
   # The tree/PR-state resolution is SHIPPED, not written out here: one read point, one set
   # of arms, executable and smoke-tested (scripts/smoke-tests/scenarios/pr-tree-resolve.sh
   # in this repository) instead of a snippet only prose could check. `resolve_pr_tree`
   # makes the ONE code-host round trip this step needs — head ref + head sha + number +
   # labels — skips it when the repo has no code-host remote, and assigns every name
   # points 2–7 read. The snippet below assumes the REPO-ROOT working directory (where CI
   # runs it), so it sources the helper by its repo-root-relative path; the `../../../.pair/…`
   # in the markdown links is only this skill file's relative path to the SAME asset.
   source .pair/knowledge/assets/pr-tree-resolve.sh   # PR state + tags only, no criteria (D18)
   resolve_pr_tree "$pr"           # empty `$pr` ⇒ the checked-out branch's own PR
   TREE_ROW="$(render_tree_row)"   # the `Tree:` row, rendered from the resolved value

   # The TIER side of the step is initialized here, for the same reason the resolver
   # initializes its own names: this skill is idempotent and is re-invoked in shells where a
   # previous run's variables survive, and `TIER`/`ACTIVE_SUITES` are read OUTSIDE this step
   # (Step 4 runs "only the suites in ACTIVE_SUITES"), so a surviving narrower value would
   # make Step 4 run LESS than the arm that resolved describes — a silent NARROW on exactly
   # the paths whose purpose is to fail safe (D17). Initialize to the WIDEST value and
   # re-assign on EVERY arm below, the two that read no tag included (tiering `disabled`,
   # matrix fallback): those promise the full set in prose.
   TIER_SOURCE="fail-safe — no source resolved"   # one value per `Tier source:` arm
   LABELS=""                # point 3 reads it on EVERY arm, assigns it on only some
   TIER="n/a"               # the tiering-enabled path overwrites it with resolve_tier's value
   ACTIVE_SUITES=all        # sentinel: every adopted gate, NOT a suite named `all` (Step 4)
   ```

   - **What the resolver assigns** — the contract points 2–7 consume, [`pr-tree-resolve.sh`](../../../.pair/knowledge/assets/pr-tree-resolve.sh): `TREE_MATCH` (`match` | `ahead` | `mismatch` | `unknown` | `none` | `no-remote` — never guessed), `LOCAL_TREE` (the commit-pinned local side), `PR_ARG` (the identifier as passed — empty means "this branch's PR", and it is what selects the arms in point 3), `PR_NUM` (normalized from a bare number, the `#420` spelling, or a `pull/<n>` URL, and authoritative from the read once it succeeds), `PR_HEAD_REF` / `PR_HEAD_SHA`, `PR_LABELS` (the labels that same read already fetched — point 3 consumes them with **no** second round trip), the three states one failing read hides (`PR_READ_OK` / `NO_PR_ON_BRANCH` / `NO_CODE_HOST`), and `AHEAD_N`. The match test is a **head-commit** compare on both paths (branch names are display only, never the test), so **being on the PR's branch is never itself a match** — locally committed, not-yet-pushed work is exactly what the `ahead` arm names.
   - **Another code host** — override `pr_view_json`, the single read, and nothing else changes: `gh pr view --json labels,headRefName,headRefOid,number` is the GitHub spelling, where `headRefName`/`headRefOid` mean "the PR's head branch" / "the PR's head COMMIT SHA". Substitute that host's command **and** its field names per the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). Never drop the read: an unread PR fail-safes 🔴 and renders `Tree: unknown` for a PR that was in fact reachable.
   - **Row rendering** — `render_tree_row` is the executable projection of the Output Format `Tree:` arms, one per resolved value, so the row is never retyped from prose. `unknown` carries **two spellings, because `PR_NUM` may not be known**: `unknown — PR #<PR_NUM> unreadable` when it is non-empty (a `$pr` was supplied and normalized), and `unknown — the current-branch PR could not be read` when it is **empty** — the no-`$pr` path, where the read failed for a reason other than "no pull requests found" (unauthenticated, offline, rate-limited) and no number was ever assigned; a single numbered spelling would render the malformed `PR # unreadable` there. `no-remote` is kept apart from `unknown` for the same reason: the read was **skipped**, and "not configured" is not "not reachable".

2. **Check — is tiering on?** Read the `Pre-merge tiering` flag in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md).
   - **`disabled` (the default), or the flag/section is absent** → **full suite**: the CI gate runs every suite on every PR, so mirror that — set the active suite set to **all adopted gates** (base + unit + integration + e2e + custom + aggregate, exactly the current behavior). Report `Tiering: disabled — running the full suite (CI parity)`, report the `Tree:` row point 1 already resolved — **fully** resolved, on either path, including its ⚠️ arm (it is tier-independent) — and **assign** the rows and the suite variables rather than improvising them: `TIER_SOURCE="n/a (tiering disabled — no tag read)"`, `TIER="n/a"`, `ACTIVE_SUITES=all` (the sentinel Step 4 reads as "every adopted gate"), then skip to Step 2. (Assign, not narrate: `TIER_SOURCE` still holds its `fail-safe — no source resolved` initializer here, so an agent rendering the variable it was told to resolve would report a fail-safe attribution on a run that never attempted a tier read — and this is the **default** configuration. `TIER`/`ACTIVE_SUITES` are the same class one step worse: they are read **outside** this step, by Step 4, so a value surviving from a previous run in the same shell would silently NARROW the set this arm describes in prose as the full one.) Do NOT read tags in this mode: point 1's read already happened and its labels are simply left unconsumed. **Suites the repo lacks are still SKIPPED, not failed, here** — the graceful-degradation rule below applies (absent suites are skipped in full-suite mode); the missing-suite-is-a-failure rule (point 5 below) fires *only* on the enabled path when a resolved tier requires that suite.
   - **`enabled`** → continue; the CI gate is tier-scoped, so scope locally by tier.

3. **Act — resolve the tier from tags (never from the diff).** Load the shipped helper and resolve the `risk:*` tag. The snippet below assumes the **repo-root working directory** (where CI runs it), so it sources the helper by its repo-root-relative path; the `../../../.pair/...` in the markdown links above is only this skill file's relative path to the *same* asset — not a second copy:

   ```bash
   source .pair/knowledge/assets/tier-resolve.sh   # tags only, no criteria (D18)
   REASON=""

   # Test for the TAG, never for emptiness: a card/PR carrying other labels (pr-state:*,
   # cost:*, a type label) and no risk:* one has NON-EMPTY labels — the normal shape once the
   # PR state flow is provisioned. (A present-but-malformed risk:* tag is resolve_tier's own
   # fail-safe, not this case.)
   has_risk_tag() { printf '%s\n' "$1" | grep -q '^risk:'; }

   # No second round trip: `resolve_pr_tree` already fetched the labels with the head
   # fields, in `PR_LABELS`. THREE
   # states hide behind ONE failing read there, and neither exit status nor label emptiness
   # separates them:
   #   (a) a PR with labels               → its labels decide;
   #   (b) a PR with ZERO labels          → reachable-with-no-tag (a freshly published PR),
   #       NOT "no PR" — an emptiness test would drop to the story card's REFINEMENT tier
   #       while a PR exists: the under-check the precedence below forbids;
   #   (c) no PR on this branch vs. an unreachable host → the command exits non-zero for
   #       BOTH, so the MESSAGE decides (`resolve_pr_tree` raises NO_PR_ON_BRANCH only on
   #       the "no pull requests found" text, and on the no-remote skip; on another code
   #       host, match ITS message — routing table).
   if [ "$PR_READ_OK" = "1" ]; then
     # (a)/(b) A PR was read: ITS labels decide — never the story card's refinement tier.
     # The labels come from the CODE HOST, so even on the `$pr` path no tier value was
     # transported: it is read here, from the same source CI gates on — `resolve_pr_tree`
     # kept them from the one read it already made.
     LABELS="$PR_LABELS"
     if [ -n "$PR_ARG" ]; then
       # The caller named WHICH PR — the path `/review` takes off the PR's branch.
       TIER_SOURCE="PR #$PR_NUM (named by \$pr)"
       has_risk_tag "$LABELS" || REASON="PR #$PR_NUM reachable but carries no risk:* tag"
     else
       # Primary standalone path: the checked-out branch's own PR, so a review-raised
       # (D17) tag on it is always honoured — never a stale story-card tier.
       TIER_SOURCE="current-branch PR #$PR_NUM"
       has_risk_tag "$LABELS" || REASON="current-branch PR #$PR_NUM reachable but carries no risk:* tag"
     fi
     # NO story-card fallback on either arm (see precedence below).
   elif [ -n "$PR_ARG" ]; then
     # A PR was NAMED and could not be read: a source WAS resolved, so neither the
     # "named by $pr" arm (it would claim a tier read from an unreadable PR) nor the
     # sourceless fail-safe describes this — it gets its own source AND its own reason.
     TIER_SOURCE="PR #$PR_NUM named but unreadable"
     if [ "$NO_CODE_HOST" = "1" ]; then
       # The read was SKIPPED, not attempted: naming an unreachable host here would
       # misattribute a missing configuration to a network problem.
       REASON="PR #$PR_NUM unreadable — no code-host remote is configured, so no PR was read"
     else
       REASON="PR #$PR_NUM unreadable — nonexistent identifier, or the code host is not reachable"
     fi
   elif [ "$NO_PR_ON_BRANCH" = "1" ]; then
     # (c1) Genuinely no PR on this branch — the ONLY case that falls through.
     if [ -n "$story" ]; then
       # Pre-publish only: fall back to the story card — a PM-TOOL read, which on a split
       # project is a DIFFERENT tool. Substitute the PM tool's own command for `gh issue
       # view` (Linear GraphQL, az boards, the item file, …) — otherwise this line fails
       # and the tier silently drops to the fail-safe for the WRONG reason.
       TIER_SOURCE="story card #$story"
       if ! LABELS="$(gh issue view "$story" --json labels -q '.labels[].name' 2>/dev/null)"; then
         LABELS=""      # a failed read may leave a partial value: never resolve a tier from it
         TIER_SOURCE="story card #$story named but unreadable"
         REASON="story card unreadable — the PM tool is not reachable by this command (split tools?)"
       elif ! has_risk_tag "$LABELS"; then
         REASON="story card reachable but carries no risk:* tag"
       fi
     elif [ "$NO_CODE_HOST" = "1" ]; then
       # No remote AND no `$story`: sourceless, but for a CONFIGURATION reason the generic
       # line would hide — a project bootstrapped with no code host yet, whose caller passed
       # no card either. Its own source and reason, so the report names the fixable thing.
       TIER_SOURCE="no code-host remote — no PR to read"
       REASON="no code-host remote and no \$story — nothing to read a risk:* tag from"
     fi
     # Host said "no PR" and no `$story` either: the one genuinely sourceless case →
     # TIER_SOURCE keeps its initial `fail-safe — no source resolved` and the GENERIC
     # fail-safe line is used.
   else
     # (c2) The read itself failed on the no-`$pr` path. Never the story card: this is a PR
     # that may exist and may carry a raised tag, so falling back to the refinement tier
     # would be an under-check — same rule as the `$pr` path.
     TIER_SOURCE="current-branch PR unreadable"
     REASON="current-branch PR unreadable — the code host is not reachable"
   fi
   TIER="$(resolve_tier "$LABELS")"                       # green | yellow | red (red = fail-safe if empty)
   ACTIVE_SUITES="$(required_suites_for_tier "$TIER")"    # e.g. "install lint type build unit"
   ```

   - **Resolution precedence**: `$pr` → current-branch PR → `$story` card → fail-safe 🔴. An entry is consulted only when the ones before it were **not supplied**, or — for the branch PR — when the branch demonstrably **has no PR**; never as a retry of one that **failed**. So a supplied `$pr` that yields no tag resolves to the fail-safe: it **never** falls through to the branch PR (a *different* PR) or to the story card (the *refinement* tier, which review confirms-or-**raises**, D17 — running it would be an **under-check**, the one direction the model forbids). The same rule holds one level down: a branch PR that is **unreadable** fails safe with its own reason, it does not degrade to the story card.
   - **The tier source is not the tree**: `$pr` makes the *tier* exact, not the *result*. When the working tree is not that PR's head, the suites still run against the checked-out code, so the report states the two separately — and **both rows are resolved variables, not improvised prose**: one `TIER_SOURCE` / `TREE_MATCH` value per rendered arm, so "a PR was named but could not be read" renders as itself instead of borrowing an arm that claims a tier came from a PR nobody could read. `TREE_MATCH` is a **head-commit** compare on **both** paths and in every case (branch names are display only, never the test), with the six values point 1 enumerates. **Being on the PR's branch is never itself a match** — locally committed, not-yet-pushed work is exactly what the `ahead` arm exists to name.

   - **Two different tools when the project splits them**: the PR labels come from the **code host** and the story card from the **PM tool** (the `gh` commands above — the resolver's default read and `gh issue view` — are the single-tool GitHub case, where they coincide). Resolve each side per the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) and substitute that tool's command — the precedence (PR labels win, story card is the pre-publish fallback) is unchanged, because CI gates on the code host's PR labels either way.
   - **Edge — pre-publish (no PR yet)**: when the branch has no PR, pass the **story id** as `$story` and the tier resolves from the story card on the PM tool (`gh issue view` for GitHub), as above. A standalone run on a branch that already has a PR needs **no** `$story`: the PR's labels win, so a review-raised (D17) tag is never under-run versus CI.
   - **Fail-safe**: `resolve_tier` returns `red` for **no** `risk:*` tag or an **unknown/malformed** value — the widest matrix, never a silent skip. When the tier came from the fail-safe, say so explicitly in the report: `Tier: 🔴 red (fail-safe — no resolvable risk:* tag; running the full set)`. **Report the reason the snippet resolved, never a generic one**: an unreachable PM tool is `Tier: 🔴 red (fail-safe — story card unreadable: PM tool not reachable by this command; running the full set)`, distinct from a reachable card with no tag. Misattributing the first as the second hides a configuration problem (a split project running the single-tool `gh issue view`) behind a correct-looking widen. The `$pr` path reports the same way: `Tier: 🔴 red (fail-safe — PR #123 reachable but carries no risk:* tag; running the full set)` is distinct from `… PR #123 unreadable: nonexistent identifier or code host unreachable …` — an invalid identifier is a fail-safe with its own reason, never a crash. The current-branch path is symmetric with it — `… current-branch PR unreadable: the code host is not reachable …` is its own reason too, distinct from `… current-branch PR #124 reachable but carries no risk:* tag …` (that arm read the PR's number, so it names it). A repo with **no code-host remote** is a third variant, not a fourth spelling of "unreachable": the read was **skipped**, so `Tree:` renders the `no-remote` arm, a supplied `$story` still resolves the tier (no remote ⇒ provably no PR ⇒ the pre-publish case the fallback exists for), and with no `$story` either the report says `no code-host remote — no PR to read` — a fixable configuration, named. The **generic** line is reserved for the one case with genuinely no source: no `$pr`, no PR on the branch (the host said so, i.e. a host that answered), no `$story`. Every other path sets a **distinct** `REASON` — which is why the snippet decides on the **presence of a `risk:*` tag** and on the host's **no-PR message**, never on empty labels or on a bare non-zero exit: a card/PR labelled `pr-state:to-be-reviewed` and nothing else is reachable-with-no-tag, and an unreachable host is a failure — neither is sourceless.
   - **Widen-only**: because review never lowers a tier (D17), a later run can only widen the set versus an earlier one on the same item — never narrow.

4. **Act — the tier→checks matrix** (projection of [quality-model.md §4](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md); the executable copy is `required_suites_for_tier`, the single source — this skill does not restate an independent matrix):

   | Tier | Active check set (what CI would run) |
   | --- | --- |
   | 🟢 `risk:green` | base = install + lint + type + build |
   | 🟡 `risk:yellow` | base + unit |
   | 🔴 `risk:red` | base + unit + integration + e2e |

   Base (install + lint + type + build) runs at **every** tier. Custom gates and the aggregate (Steps 5–6) still run per adoption regardless of tier (they are the project's "how", not tier suites).

5. **Act — a required suite that is absent locally is an EXPLICIT failure, never a silent pass.** For each suite the tier requires, check presence the same layout-independent way CI does (`grep -q '"test:<suite>"' package.json`) and call `require_suite`:

   ```bash
   require_suite unit "$(grep -q '"test:unit"' package.json && echo 1 || echo 0)" || SUITE_MISSING=1
   ```

   If a required suite is missing, report `Suite missing: <name> — CI will fail on this tier` and mark the verdict red. It is **not** a silent pass.

6. **Act — matrix/KB not found (graceful degradation).** If `tier-resolve.sh` or the quality model cannot be read (e.g. the KB is absent), **fall back to running all adopted gates** (the current full-suite behavior), print a notice: `Gate matrix not found — falling back to all adopted gates (could not confirm CI parity)`, and **assign** the source row and the suite variables for this mode too — `TIER_SOURCE="n/a (matrix fallback — no tag read)"`, `TIER="n/a"`, `ACTIVE_SUITES=all` — for the same reason as the `disabled` arm above: no tier was read, so neither a PR/story attribution nor the `fail-safe — no source resolved` initializer is true here, and Step 4 must not read a narrower suite set than this notice announces. Never silently skip.

7. **Verify**: `TIER` and `ACTIVE_SUITES` are **assigned** on the arm that ran — a tier value + its suites on the tiering-enabled path, `n/a` + the `all` sentinel on the two arms that read no tag (tiering disabled, matrix fallback). Nothing downstream may read either name unassigned. The standard gates below run only the suites in `ACTIVE_SUITES` (further narrowed by `$scope` if given).

### Step 2: Lint Gate (base — every tier)

1. **Check**: Run the project linter (e.g., `pnpm lint` or `turbo lint`). Capture output.
2. **Skip**: If zero violations, report "Lint: PASS" and move to Step 3.
3. **Act**: If violations found, report each violation with file and line — surface the failing command output verbatim.
4. **Verify**: After developer fixes, re-run linter to confirm zero violations.

### Step 3: Type Check + Build Gate (base — every tier)

1. **Check**: Run the type checker and build (e.g., `pnpm ts:check` and `pnpm build`, or `turbo build`). Capture output.
2. **Skip**: If zero errors, report "Type Check + Build: PASS" and move to Step 4.
3. **Act**: If errors found, report each error with file and line — surface the failing command output verbatim.
4. **Verify**: After developer fixes, re-run to confirm zero errors.

### Step 4: Test Gate (tier-scoped)

Run only the test suites in `ACTIVE_SUITES` (Step 1.5) — this is where the tier changes the local run to match CI. **`ACTIVE_SUITES=all` is a sentinel, not a suite name**: it means *every* adopted suite (the two arms that read no tag — tiering `disabled` and the matrix fallback — assign it), so run the full adopted set there rather than looking for a suite called `all`.

- 🟢 green → **no test suite** (base only).
- 🟡 yellow → **unit** (`pnpm test:unit`, or the adopted unit command / aggregate `test`).
- 🔴 red → **unit + integration + E2E** (`pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`).

For each suite in `ACTIVE_SUITES`:

1. **Check**: Run the suite. Capture output including coverage.
2. **Skip**: If it passes, report "Tests (`<suite>`): PASS (N tests, X% coverage)".
3. **Act**: If it fails, report each failure with test name, file, and assertion message — **surface the failing command output** so the red verdict shows exactly what CI would block on.
4. **Verify**: After developer fixes, re-run the suite to confirm all pass.

A suite the tier requires but the repo lacks was already flagged in Step 1.5 (`Suite missing — CI will fail`) and keeps the verdict red.

### Step 5: Custom Gates (from adoption)

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → look for a `### Custom Gate Registry` section.
2. **Branch** based on what is found:

   **A) Custom Gate Registry table found** → execute custom gates (Step 5.A).

   **B) Explicit opt-out found** (section contains "No custom quality gates") → skip to Step 6 silently.

   **C) No Custom Gate Registry section at all** → first-time setup (Step 5.C).

#### Step 5.A: Execute Custom Gates

1. **Act**: For each row in the table, ordered by `Order`, filtered by `$scope`:
   - `$scope = all` → run all custom gates.
   - `$scope = <scope-key>` → run only gate(s) matching that scope key.
   - For each gate, apply check → skip → act → verify:
     - **Check**: Has this gate already run in this session?
     - **Skip**: If cached result exists, reuse it.
     - **Act**: Run the gate command. Capture output and exit code.
     - **Verify**: Record result based on `Required` column:
       - `Required = Yes` → exit code 0 = PASS, non-zero = FAIL (contributes to overall FAIL).
       - `Required = No` (Advisory) → exit code 0 = PASS, non-zero = WARNING (does not block).
2. **Verify**: All custom gates executed and results recorded. Move to Step 6.

#### Step 5.C: First-Time Custom Gate Setup

1. **Act**: Ask the developer:

   > No custom quality gates configured. Would you like to add custom gate steps (e.g., formatting, security scan, markdown lint)?
   > If not, I'll record the opt-out so this question won't be asked again.

2. **Branch**:
   - **Developer says yes** → help define gates and write the Custom Gate Registry table to [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md). Then execute them (Step 5.A).
   - **Developer says no** → write the opt-out marker to [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md):

     ```markdown
     ### Custom Gate Registry

     No custom quality gates configured. To add custom gates, replace this line with the gate table (see quality-gates.md).
     ```

3. **Verify**: way-of-working.md updated. Move to Step 6.

See [quality-gates.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/quality-gates.md) for Custom Gate Registry table schema and enforcement level semantics.

### Step 6: Aggregate Quality Gate

If a project-level quality gate command exists (from Step 1):

1. **Check**: Run the aggregate command (e.g., `pnpm quality-gate`).
2. **Skip**: If exit code 0, report "Quality Gate: PASS" and move to output.
3. **Act**: If non-zero exit, report the failing sub-gates — surface the failing command output.
4. **Verify**: After developer fixes, re-run to confirm pass.

## Output Format

Present results as:

```text
QUALITY GATE REPORT:
├── Tier:        [🟢 green | 🟡 yellow | 🔴 red (fail-safe — reason) | disabled — full suite | matrix not found — fallback]
├── Tier source: [PR #N (named by `$pr`) | PR #N named but unreadable | current-branch PR #N | current-branch PR unreadable | story card #ID | story card #ID named but unreadable | no code-host remote — no PR to read | n/a (tiering disabled — no tag read) | n/a (matrix fallback — no tag read) | fail-safe — no source resolved]
├── Tree:        [<tree> — matches PR #N's head (<head-branch>@<sha7>) | <tree> — ahead of PR #N's head (<head-branch>@<sha7>, N unpushed — expected pre-push) | ⚠️ NOT PR #N's head (<head-branch>@<sha7>) — the suites ran against <tree> | unknown — PR #N unreadable | unknown — the current-branch PR could not be read | <tree> — no PR on this branch (pre-publish) | <tree> — no code-host remote (no PR to read)]
├── Check set:   [the suites this tier runs — e.g. install lint type build unit] (CI parity)
├── Lint:        [PASS | FAIL — N violations]
├── Type+Build:  [PASS | FAIL — N errors]
├── Tests:       [per active suite: PASS — N tests, X% coverage | FAIL — N failures | SKIPPED (tier) | MISSING — CI will fail]
├── Custom:      [N gates — N PASS, N FAIL, N WARNING | No custom gates]
└── Aggregate:   [PASS | FAIL | N/A]

RESULT: [ALL GATES PASS | BLOCKED — N gates failing]
```

`<tree>` is the code the suites actually ran on, **pinned to a commit**: `<checked-out branch>@<sha7>`, or `<sha7>` alone in a detached checkout. A branch name alone moves, so the ⚠️ arm would otherwise name the code that was NOT run without naming the code that WAS.

A red verdict always surfaces the failing command output so it matches exactly what CI would block on.

## Composition Interface

When composed by `/pair-process-implement` or `/pair-process-review`:

- **Input**: The composing skill invokes `/pair-capability-verify-quality` after implementation or before commit. It may pass `$pr` to name the PR the tier is resolved from (how `/pair-process-review` composes it), or `$story` for the pre-publish card; with neither, the tier resolves from the current-branch PR.
- **Output**: Returns PASS or FAIL with details (and the resolved tier / check set). The composing skill decides what to do:
  - `/pair-process-implement`: HALT on FAIL — developer must fix before commit.
  - `/pair-process-review`: Report FAIL as review finding — does not block review completion.

The composition contract is **unchanged** for callers (same PASS/FAIL result); the tier resolution is internal to this skill.

> **Which PR, not which tier.** With no `$pr`, resolution starts at the no-arg `gh pr view` (Step 1.5), which finds labels only when the invocation cwd is on that PR's branch — the standalone pre-push developer flow. `/pair-process-review` composes this skill from a context that is often **not** the PR's branch, so it passes **`$pr` = the PR under review**: the tier is then read from that PR's own labels — the same source CI gates on, review-raised (D17) tags included — instead of degrading to the fail-safe 🔴 full set. What crosses the composition boundary is the PR **identifier**; the tier is read here, never carried, so there is no second source of truth to keep widen-only. Exactness stops at the tier: if the checked-out tree is not that PR's head, the suites still run against the tree, which the report states separately (`Tier source:` / `Tree:`) — and the caller's rule keys on the `Tree:` row's **resolved value**, not on the ⚠️ glyph: only `match` is authoritative, while `ahead`, `mismatch`, `unknown` and `none` are **advisory**, since each describes a result over code that is not (or cannot be shown to be) the PR's head. `/pair-process-review` remains non-blocking on this skill — its classify step is the authoritative review-time tier — and a raise it makes *after* the gates ran (its Step 2.4) is answered by a re-run, never by a narrower report.

When invoked **independently**:

- Resolve the tier (Step 1.5), then run the tier's check set (or scoped gates if `$scope` is provided).
- Report results. No side effects — this skill only reads and reports.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → run only what's detectable rather than failing) for the standard scenarios. Additional cases:

- **Gate matrix / `tier-resolve.sh` / quality model not found**: fall back to running all adopted gates (the full-suite behavior) with the notice in Step 1.5 — never a silent skip.
- **`gh` / code host / PM tool not available to read tags**: cannot resolve a tag → apply the fail-safe (🔴 red, full set) and note that tags could not be read (and which side was unreachable — the code host's PR or the PM tool's story card). Never assume green.
- If a standard gate command is not available (e.g., no test script in package.json), skip that gate and report: "Tests: SKIPPED — no test command found." (If the tier *required* that suite, it is instead a `Suite missing — CI will fail`, per Step 1.5.)
- If no quality-related scripts are found at all, report: "No quality gates detected. Configure quality gate commands in package.json or way-of-working.md."
- If a custom gate command fails to execute (command not found), report as WARNING: "Gate `[name]`: SKIPPED — command not found."
- If [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) is not found, skip custom gates entirely (standard gates still run) and treat tiering as disabled (full suite).

## Notes

- The read-only-except-Step-5.C rule is stated once, in the overview above — this Notes section doesn't restate it.
- **Local = CI**: the tier and its suites are resolved through the *same* [`tier-resolve.sh`](../../../.pair/knowledge/assets/tier-resolve.sh) helper the CI pre-merge gate uses, so the check set and verdict match. This skill owns no matrix of its own (D18) — [quality-model.md §4](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) is the single source. "Local = CI" scopes to the **tier check set** — see the coverage-guardrail caveat below.
- **Coverage guardrail is NOT mirrored locally**: the coverage-baseline guardrail (a separate opt-in CI job — the "twin of tiering") is **not** a tier suite and this skill does **not** run it. When a project sets `Coverage guardrail: enabled`, CI runs that baseline job *in addition to* the tier suites; the "local = CI" parity above covers the tier suites and verdict only, not the coverage guardrail.
- **Secret scanning is NOT mirrored locally**: deterministic secret scanning (gitleaks by default) is a separate, **unconditional** CI layer that runs at *every* tier — including 🟢 green — not a tier suite (D24; owned by `setup-gates` / `assess-security`). This skill does **not** scan for committed secrets, so a committed secret can pass verify-quality green locally yet still trip a red secret-scan job at CI. The "local = CI" parity above is scoped to the tier check set + verdict; the secret-scan layer is deliberately out of its scope.
- Standard gates (Lint, Type+Build, Test) are universal and language/platform-independent. Custom gates are project-specific and defined in adoption (see the sources of truth above).
- Each gate is independent — a failure in one gate does not prevent checking subsequent gates.
- Re-invoke after fixes to confirm resolution. Already-passing gates are re-verified but complete instantly.
- First-time setup (Step 5.C) only triggers once — after the developer responds, way-of-working.md is updated and subsequent invocations follow branch A or B.
