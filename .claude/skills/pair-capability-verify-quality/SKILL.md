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
| `$pr`    | No       | A **PR identifier** (number or URL) naming **which PR** the tier is resolved from. Its `risk:*` labels are read from the **code host** — the same source CI gates on, review-raised (D17) tags included. It names the PR; **the tier is read, never carried** across the boundary, so there is no second source of truth and no widen-only guard of its own. Pass it when the invocation is **not** on that PR's branch (how `/pair-process-review` composes this skill). **Optional and additive**: callers that omit it are unchanged. |
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

1. **Act — which code do the suites run against? (tier-independent, always).** The tier and the tree are two different questions and only the first depends on tiering, so resolve the tree **before** the flag is read: the report's `Tree:` row — and the caller rule keyed on it (`/pair-process-review` Step 2.1 treats a `Tree: ⚠️` run as **advisory** and keeps it out of its state synthesis) — must exist in **every** configuration, `Pre-merge tiering: disabled` (the default) included. Otherwise a review run from an unrelated checkout reports green gates with nothing saying which code they ran on.

   ```bash
   # ONE round trip for every field this skill reads from the PR: head ref + head sha
   # (this point) and labels (point 3, consumed only when tiering is enabled).
   # `-q` emits headRefName on line 1, headRefOid on line 2, then one label per line.
   TREE_MATCH=none          # match | mismatch | unknown | none — resolved, never guessed
   PR_FIELDS=""
   PR_READ_OK=0
   if [ -n "$pr" ]; then
     if PR_FIELDS="$(gh pr view "$pr" --json labels,headRefName,headRefOid \
                       -q '.headRefName, .headRefOid, (.labels[].name)' 2>/dev/null)"; then
       PR_READ_OK=1
       PR_HEAD_REF="$(printf '%s\n' "$PR_FIELDS" | sed -n 1p)"   # display half of the row
       PR_HEAD_SHA="$(printf '%s\n' "$PR_FIELDS" | sed -n 2p)"
       LOCAL_REF="$(git rev-parse --abbrev-ref HEAD)"            # "HEAD" when detached
       # Compare COMMITS, in BOTH cases — never branch names. A checkout sitting ON the
       # PR's branch at a DIFFERENT commit (stale, or ahead with unpushed work) is not the
       # PR's head, and a DETACHED review worktree at the head is; a name compare gets the
       # first wrong and the second wrong in the opposite direction. Branch names stay the
       # human-readable half of the `Tree:` row, never the test.
       [ "$(git rev-parse HEAD)" = "$PR_HEAD_SHA" ] && TREE_MATCH=match || TREE_MATCH=mismatch
     else
       # The PR could not be read at all: the tree relation is UNKNOWN, not a mismatch —
       # never assert as fact something this snippet could not read.
       TREE_MATCH=unknown
     fi
   fi
   ```

   Row rendering (the Output Format `Tree:` arms, one per resolved value): `match` → `<LOCAL_REF, or the HEAD commit when detached> — matches PR #N's head`; `mismatch` → `⚠️ NOT PR #N's head — the suites ran against this tree`; `unknown` → `unknown — PR #N unreadable`; `none` → `<LOCAL_REF> — no PR named (pre-publish / tiering disabled)`. Point 3 promotes `none` to `match` when the checked-out branch turns out to have a PR of its own.

2. **Check — is tiering on?** Read the `Pre-merge tiering` flag in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md).
   - **`disabled` (the default), or the flag/section is absent** → **full suite**: the CI gate runs every suite on every PR, so mirror that — set the active suite set to **all adopted gates** (base + unit + integration + e2e + custom + aggregate, exactly the current behavior). Report `Tiering: disabled — running the full suite (CI parity)`, report the `Tree:` row point 1 already resolved (it is tier-independent) and `Tier source: n/a (tiering disabled — no tag read)`, then skip to Step 2. Do NOT read tags in this mode. **Suites the repo lacks are still SKIPPED, not failed, here** — the graceful-degradation rule below applies (absent suites are skipped in full-suite mode); the missing-suite-is-a-failure rule (point 5 below) fires *only* on the enabled path when a resolved tier requires that suite.
   - **`enabled`** → continue; the CI gate is tier-scoped, so scope locally by tier.

3. **Act — resolve the tier from tags (never from the diff).** Load the shipped helper and resolve the `risk:*` tag. The snippet below assumes the **repo-root working directory** (where CI runs it), so it sources the helper by its repo-root-relative path; the `../../../.pair/...` in the markdown links above is only this skill file's relative path to the *same* asset — not a second copy:

   ```bash
   source .pair/knowledge/assets/tier-resolve.sh   # tags only, no criteria (D18)
   REASON=""

   # Test for the TAG, never for emptiness. A card/PR carrying other labels (pr-state:*,
   # cost:*, a type label) and no risk:* one has NON-EMPTY labels — the normal shape in a
   # repo with the PR state flow provisioned. An `[ -z "$LABELS" ]` test would leave REASON
   # unset there and the report would fall back to the GENERIC fail-safe line the Fail-safe
   # bullet below forbids. A risk:* tag that is present but malformed is NOT this case:
   # resolve_tier reports that one itself (its own "malformed" fail-safe message).
   has_risk_tag() { printf '%s\n' "$1" | grep -q '^risk:'; }

   if [ -n "$pr" ]; then
     # Explicit PR (`$pr`) — the caller names WHICH PR to read; the labels still come from
     # the CODE HOST, so no tier value is transported, it is read here from the same source
     # CI gates on. This is the path `/review` takes when it is not on the PR's branch.
     # No second round trip: point 1 already fetched labels with the head fields.
     if [ "$PR_READ_OK" != "1" ]; then
       REASON="PR $pr unreadable — nonexistent identifier, or the code host is not reachable"
     else
       LABELS="$(printf '%s\n' "$PR_FIELDS" | sed '1,2d')"   # lines 3.. are the label names
       has_risk_tag "$LABELS" || REASON="PR $pr reachable but carries no risk:* tag"
     fi
     # NO story-card fallback on this path (see precedence below).
   else
     # Primary — the CURRENT-BRANCH PR's labels, read from the CODE HOST: the authoritative
     # tier CI gates on. `gh pr view` with NO argument resolves the PR of the checked-out
     # branch, so a review-raised (D17) tag on the PR is always honoured — never a stale
     # story-card tier. `gh` here IS the code-host command for GitHub; on another code host
     # substitute that host's equivalent (routing table).
     #
     # THREE states hide behind one failing command here, and neither the exit status nor
     # label emptiness separates them on its own:
     #   (a) a PR exists and carries labels     → its labels decide;
     #   (b) a PR exists with ZERO labels       → reachable-with-no-tag (the shape a freshly
     #       published PR has), NOT "no PR" — an `[ -z "$LABELS" ]` test would misread it and
     #       drop resolution to the story card's REFINEMENT tier while a PR exists: the
     #       under-check the precedence below forbids;
     #   (c) no PR on this branch vs. an unreachable code host — `gh pr view` exits non-zero
     #       for BOTH, so the MESSAGE decides: only the "no pull requests found" text is the
     #       pre-publish case that may fall through to `$story`. On another code host, match
     #       ITS no-PR-for-this-branch message (routing table).
     BRANCH_ERR="$(mktemp)"
     if LABELS="$(gh pr view --json labels -q '.labels[].name' 2>"$BRANCH_ERR")"; then
       # (a)/(b) A PR exists on this branch: ITS labels decide — never the story card's
       # refinement tier. Emptiness is not consulted; tag PRESENCE is.
       has_risk_tag "$LABELS" || REASON="current-branch PR reachable but carries no risk:* tag"
       TREE_MATCH=match   # the tree IS the branch whose PR labels were just read
     elif grep -qi 'no pull requests found' "$BRANCH_ERR"; then
       # (c1) Genuinely no PR on this branch — the ONLY case that falls through.
       if [ -n "$story" ]; then
         # Pre-publish only: fall back to the story card — a PM-TOOL read, which on a split
         # project is a DIFFERENT tool. Substitute the PM tool's own command for `gh issue
         # view` (Linear GraphQL, az boards, the item file, …) — otherwise this line fails
         # and the tier silently drops to the fail-safe for the WRONG reason.
         if ! LABELS="$(gh issue view "$story" --json labels -q '.labels[].name' 2>/dev/null)"; then
           REASON="story card unreadable — the PM tool is not reachable by this command (split tools?)"
         elif ! has_risk_tag "$LABELS"; then
           REASON="story card reachable but carries no risk:* tag"
         fi
       fi
       # No `$story` either: the one genuinely sourceless case → the GENERIC fail-safe line.
     else
       # (c2) The read itself failed. Never the story card: this is a PR that may exist and
       # may carry a raised tag, so falling back to the refinement tier would be an
       # under-check — same rule as the `$pr` path.
       REASON="current-branch PR unreadable — the code host is not reachable"
     fi
     rm -f "$BRANCH_ERR"
   fi
   TIER="$(resolve_tier "$LABELS")"                       # green | yellow | red (red = fail-safe if empty)
   ACTIVE_SUITES="$(required_suites_for_tier "$TIER")"    # e.g. "install lint type build unit"
   ```

   - **Resolution precedence**: `$pr` → current-branch PR → `$story` card → fail-safe 🔴. An entry is consulted only when the ones before it were **not supplied**, or — for the branch PR — when the branch demonstrably **has no PR**; never as a retry of one that **failed**. So a supplied `$pr` that yields no tag resolves to the fail-safe: it **never** falls through to the branch PR (a *different* PR) or to the story card (the *refinement* tier, which review confirms-or-**raises**, D17 — running it would be an **under-check**, the one direction the model forbids). The same rule holds one level down: a branch PR that is **unreadable** fails safe with its own reason, it does not degrade to the story card.
   - **The tier source is not the tree**: `$pr` makes the *tier* exact, not the *result*. When the working tree is not that PR's head, the suites still run against the checked-out code, so the report states the two separately (`Tier source:` and `Tree:` in the Output Format) and flags the mismatch — a confident report about different code is worse than a wide one. Point 1 resolves `TREE_MATCH` for that row by comparing **head commits** in every case (branch names are display only): a stale or unpushed-ahead checkout of the PR's own branch is a `mismatch`, a detached worktree at the head is a `match`, an unreadable PR is `unknown` (never a mismatch asserted without evidence), and a run with no PR named is `none`.

   - **Two different tools when the project splits them**: the PR labels come from the **code host** and the story card from the **PM tool** (the `gh` snippet above is the single-tool GitHub case, where they coincide). Resolve each side per the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) and substitute that tool's command — the precedence (PR labels win, story card is the pre-publish fallback) is unchanged, because CI gates on the code host's PR labels either way.
   - **Edge — pre-publish (no PR yet)**: when the branch has no PR, pass the **story id** as `$story` and the tier resolves from the story card on the PM tool (`gh issue view` for GitHub), as above. A standalone run on a branch that already has a PR needs **no** `$story`: the PR's labels win, so a review-raised (D17) tag is never under-run versus CI.
   - **Fail-safe**: `resolve_tier` returns `red` for **no** `risk:*` tag or an **unknown/malformed** value — the widest matrix, never a silent skip. When the tier came from the fail-safe, say so explicitly in the report: `Tier: 🔴 red (fail-safe — no resolvable risk:* tag; running the full set)`. **Report the reason the snippet resolved, never a generic one**: an unreachable PM tool is `Tier: 🔴 red (fail-safe — story card unreadable: PM tool not reachable by this command; running the full set)`, distinct from a reachable card with no tag. Misattributing the first as the second hides a configuration problem (a split project running the single-tool `gh issue view`) behind a correct-looking widen. The `$pr` path reports the same way: `Tier: 🔴 red (fail-safe — PR #123 reachable but carries no risk:* tag; running the full set)` is distinct from `… PR #123 unreadable: nonexistent identifier or code host unreachable …` — an invalid identifier is a fail-safe with its own reason, never a crash. The current-branch path is symmetric with it — `… current-branch PR unreadable: the code host is not reachable …` is its own reason too, distinct from a branch PR reachable with no tag. The **generic** line is reserved for the one case with genuinely no source: no `$pr`, no PR on the branch (the host said so), no `$story`. Every other path sets a **distinct** `REASON` — which is why the snippet decides on the **presence of a `risk:*` tag** and on the host's **no-PR message**, never on empty labels or on a bare non-zero exit: a card/PR labelled `pr-state:to-be-reviewed` and nothing else is reachable-with-no-tag, and an unreachable host is a failure — neither is sourceless.
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

6. **Act — matrix/KB not found (graceful degradation).** If `tier-resolve.sh` or the quality model cannot be read (e.g. the KB is absent), **fall back to running all adopted gates** (the current full-suite behavior) and print a notice: `Gate matrix not found — falling back to all adopted gates (could not confirm CI parity)`. Never silently skip.

7. **Verify**: `TIER` and `ACTIVE_SUITES` are resolved (or the full-suite/fallback mode is recorded). The standard gates below run only the suites in `ACTIVE_SUITES` (further narrowed by `$scope` if given).

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

Run only the test suites in `ACTIVE_SUITES` (Step 1.5) — this is where the tier changes the local run to match CI:

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
├── Tier source: [PR #N (`$pr`) | current-branch PR | story card #ID | n/a (tiering disabled / matrix fallback — no tag read) | fail-safe — no source resolved]
├── Tree:        [<checked-out branch, or HEAD commit when detached> — matches PR #N's head | ⚠️ NOT PR #N's head — the suites ran against this tree | unknown — PR #N unreadable | <checked-out branch> — no PR named (pre-publish / tiering disabled)]
├── Check set:   [the suites this tier runs — e.g. install lint type build unit] (CI parity)
├── Lint:        [PASS | FAIL — N violations]
├── Type+Build:  [PASS | FAIL — N errors]
├── Tests:       [per active suite: PASS — N tests, X% coverage | FAIL — N failures | SKIPPED (tier) | MISSING — CI will fail]
├── Custom:      [N gates — N PASS, N FAIL, N WARNING | No custom gates]
└── Aggregate:   [PASS | FAIL | N/A]

RESULT: [ALL GATES PASS | BLOCKED — N gates failing]
```

A red verdict always surfaces the failing command output so it matches exactly what CI would block on.

## Composition Interface

When composed by `/pair-process-implement` or `/pair-process-review`:

- **Input**: The composing skill invokes `/pair-capability-verify-quality` after implementation or before commit. It may pass `$pr` to name the PR the tier is resolved from (how `/pair-process-review` composes it), or `$story` for the pre-publish card; with neither, the tier resolves from the current-branch PR.
- **Output**: Returns PASS or FAIL with details (and the resolved tier / check set). The composing skill decides what to do:
  - `/pair-process-implement`: HALT on FAIL — developer must fix before commit.
  - `/pair-process-review`: Report FAIL as review finding — does not block review completion.

The composition contract is **unchanged** for callers (same PASS/FAIL result); the tier resolution is internal to this skill.

> **Which PR, not which tier.** With no `$pr`, resolution starts at the no-arg `gh pr view` (Step 1.5), which finds labels only when the invocation cwd is on that PR's branch — the standalone pre-push developer flow. `/pair-process-review` composes this skill from a context that is often **not** the PR's branch, so it passes **`$pr` = the PR under review**: the tier is then read from that PR's own labels — the same source CI gates on, review-raised (D17) tags included — instead of degrading to the fail-safe 🔴 full set. What crosses the composition boundary is the PR **identifier**; the tier is read here, never carried, so there is no second source of truth to keep widen-only. Exactness stops at the tier: if the checked-out tree is not that PR's head, the suites still run against the tree, which the report states separately (`Tier source:` / `Tree:`) — and a `Tree: ⚠️` run is **advisory** for the caller, since its result describes other code than the PR's head. `/pair-process-review` remains non-blocking on this skill — its classify step is the authoritative review-time tier — and a raise it makes *after* the gates ran (its Step 2.4) is answered by a re-run, never by a narrower report.

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
