---
name: pair-capability-verify-quality
description: "Checks whether the codebase passes the quality gates the CI pre-merge gate would run for the item/PR risk tier — resolves the `risk:*` tag, applies the KB gate matrix (🟢 lint+type+build; +unit from 🟡; +integration/E2E on 🔴), and reports pass/fail per gate so local verification mirrors CI for the tier check set (tier-check parity, no over-checking on green work; the coverage-guardrail and secret-scan CI layers are NOT mirrored locally). Fail-safe red when untagged. Skips gates already passing. Composed by /pair-process-implement and /pair-process-review; invoke directly before pushing."
version: 0.5.0
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
| `$story` | No       | A **story id**, used only for the pre-publish story-card fallback (Step 1.5) when the branch has no PR yet. The tier normally comes from the **current-branch PR** — `gh pr view` with no argument resolves it — so a **PR number is never needed here** (the branch resolves its own PR, and its labels are authoritative). Pass `$story` only to name the story card to read before a PR exists. |

`$scope` and the resolved tier compose: the tier decides the widest set CI would run; `$scope` may narrow within it (e.g. `$scope=lint`). `$scope` never *widens* past the tier. **Empty intersection is a no-op, not a failure**: if `$scope` selects a check the tier doesn't run (e.g. `$scope=tests` on 🟢 green, whose active test set is empty), the intersection is empty — that gate runs nothing and reports `SKIPPED (tier)`, never a FAIL and never a widen.

## Algorithm

Execute each gate in order. For every gate, follow the **check → skip → act → verify** pattern.

### Step 1: Read Adoption Quality Gate Configuration

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and look for a **Quality Gates** section declaring the project-specific quality gate command (e.g., `pnpm quality-gate`).
2. **Skip**: If `way-of-working.md` has no Quality Gates section, fall back to `package.json` scripts for detectable gate commands (e.g., `test`, `lint`, `ts:check`).
3. **Act**: If found, record the command for use in Step 5. Also note any sub-checks listed (e.g., type checking, testing, linting, formatting).

### Step 1.5: Resolve the Tier Gate Matrix (CI parity)

This step decides **which** suites the standard gates below run, so the local run matches what CI would run for this item/PR. It reads tags + the matrix only — no classification.

1. **Check — is tiering on?** Read the `Pre-merge tiering` flag in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md).
   - **`disabled` (the default), or the flag/section is absent** → **full suite**: the CI gate runs every suite on every PR, so mirror that — set the active suite set to **all adopted gates** (base + unit + integration + e2e + custom + aggregate, exactly the current behavior). Report `Tiering: disabled — running the full suite (CI parity)` and skip to Step 2. Do NOT read tags in this mode.
   - **`enabled`** → continue; the CI gate is tier-scoped, so scope locally by tier.

2. **Act — resolve the tier from tags (never from the diff).** Load the shipped helper and resolve the `risk:*` tag. The snippet below assumes the **repo-root working directory** (where CI runs it), so it sources the helper by its repo-root-relative path; the `../../../.pair/...` in the markdown links above is only this skill file's relative path to the *same* asset — not a second copy:

   ```bash
   source .pair/knowledge/assets/tier-resolve.sh   # tags only, no criteria (D18)
   # Primary: read the CURRENT-BRANCH PR's labels — the authoritative tier CI gates on.
   # `gh pr view` with NO argument resolves the PR of the checked-out branch, so a
   # review-raised (D17) tag on the PR is always honoured — never a stale story-card tier.
   LABELS="$(gh pr view --json labels -q '.labels[].name' 2>/dev/null)"
   if [ -z "$LABELS" ] && [ -n "$story" ]; then
     # Pre-publish only (no PR yet): fall back to the story card by id.
     LABELS="$(gh issue view "$story" --json labels -q '.labels[].name' 2>/dev/null)"  # story card
   fi
   TIER="$(resolve_tier "$LABELS")"                       # green | yellow | red (red = fail-safe if empty)
   ACTIVE_SUITES="$(required_suites_for_tier "$TIER")"    # e.g. "install lint type build unit"
   ```

   - **Edge — pre-publish (no PR yet)**: when the branch has no PR, pass the **story id** as `$story` and the tier resolves from the story card (`gh issue view`), as above. A standalone run on a branch that already has a PR needs **no** `$story`: the PR's labels win, so a review-raised (D17) tag is never under-run versus CI.
   - **Fail-safe (AC3)**: `resolve_tier` returns `red` for **no** `risk:*` tag or an **unknown/malformed** value — the widest matrix, never a silent skip. When the tier came from the fail-safe, say so explicitly in the report: `Tier: 🔴 red (fail-safe — no resolvable risk:* tag; running the full set)`.
   - **Widen-only**: because review never lowers a tier (D17), a later run can only widen the set versus an earlier one on the same item — never narrow.

3. **Act — the tier→checks matrix** (projection of [quality-model.md §4](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md); the executable copy is `required_suites_for_tier`, the single source — this skill does not restate an independent matrix):

   | Tier | Active check set (what CI would run) |
   | --- | --- |
   | 🟢 `risk:green` | base = install + lint + type + build |
   | 🟡 `risk:yellow` | base + unit |
   | 🔴 `risk:red` | base + unit + integration + e2e |

   Base (install + lint + type + build) runs at **every** tier. Custom gates and the aggregate (Steps 5–6) still run per adoption regardless of tier (they are the project's "how", not tier suites).

4. **Act — a required suite that is absent locally is an EXPLICIT failure, never a silent pass (AC / edge).** For each suite the tier requires, check presence the same layout-independent way CI does (`grep -q '"test:<suite>"' package.json`) and call `require_suite`:

   ```bash
   require_suite unit "$(grep -q '"test:unit"' package.json && echo 1 || echo 0)" || SUITE_MISSING=1
   ```

   If a required suite is missing, report `Suite missing: <name> — CI will fail on this tier` and mark the verdict red. It is **not** a silent pass.

5. **Act — matrix/KB not found (graceful degradation).** If `tier-resolve.sh` or the quality model cannot be read (e.g. the KB is absent), **fall back to running all adopted gates** (the current full-suite behavior) and print a notice: `Gate matrix not found — falling back to all adopted gates (could not confirm CI parity)`. Never silently skip.

6. **Verify**: `TIER` and `ACTIVE_SUITES` are resolved (or the full-suite/fallback mode is recorded). The standard gates below run only the suites in `ACTIVE_SUITES` (further narrowed by `$scope` if given).

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
3. **Act**: If it fails, report each failure with test name, file, and assertion message — **surface the failing command output** so the red verdict shows exactly what CI would block on (AC4).
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
├── Tier:       [🟢 green | 🟡 yellow | 🔴 red (fail-safe — reason) | disabled — full suite | matrix not found — fallback]
├── Check set:  [the suites this tier runs — e.g. install lint type build unit] (CI parity)
├── Lint:       [PASS | FAIL — N violations]
├── Type+Build: [PASS | FAIL — N errors]
├── Tests:      [per active suite: PASS — N tests, X% coverage | FAIL — N failures | SKIPPED (tier) | MISSING — CI will fail]
├── Custom:     [N gates — N PASS, N FAIL, N WARNING | No custom gates]
└── Aggregate:  [PASS | FAIL | N/A]

RESULT: [ALL GATES PASS | BLOCKED — N gates failing]
```

A red verdict always surfaces the failing command output (AC4) so it matches exactly what CI would block on.

## Composition Interface

When composed by `/pair-process-implement` or `/pair-process-review`:

- **Input**: The composing skill invokes `/pair-capability-verify-quality` after implementation or before commit. It may pass `$story` so the tier resolves from the right item; if omitted, the tier is resolved from the branch's PR or story card.
- **Output**: Returns PASS or FAIL with details (and the resolved tier / check set). The composing skill decides what to do:
  - `/pair-process-implement`: HALT on FAIL — developer must fix before commit.
  - `/pair-process-review`: Report FAIL as review finding — does not block review completion.

The composition contract is **unchanged** for callers (same PASS/FAIL result); the tier resolution is internal to this skill.

> **Tier-resolution assumes the PR branch is checked out.** The no-arg `gh pr view` primary (Step 1.5) resolves the tier from the **current-branch** PR, so it only finds the PR's labels when the invocation cwd is on that PR's branch — the standalone pre-push developer flow. When `/pair-process-review` composes this skill with only `$scope` (no `$story`) from a context **not** on the PR branch, `gh pr view` returns empty and, with no `$story` fallback, resolution degrades to the fail-safe (🔴 red, full set) rather than the tier `/pair-process-review` already resolved in its classify phase. That is the **safe over-check** direction — never an under-check — and `/pair-process-review` is non-blocking on verify-quality (its classify step is the authoritative review-time tier), so the only cost is a wider-than-necessary local run, not a wrong verdict. To get exact CI parity on that path, run this skill from the checked-out PR branch (or pass `$story`). Forwarding `/pair-process-review`'s resolved tier here would remove even that over-check, but that change belongs to `/pair-process-review` (out of scope for this skill).

When invoked **independently**:

- Resolve the tier (Step 1.5), then run the tier's check set (or scoped gates if `$scope` is provided).
- Report results. No side effects — this skill only reads and reports.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → run only what's detectable rather than failing) for the standard scenarios. Additional cases:

- **Gate matrix / `tier-resolve.sh` / quality model not found**: fall back to running all adopted gates (the full-suite behavior) with the notice in Step 1.5 — never a silent skip.
- **`gh` / PM tool not available to read tags**: cannot resolve a tag → apply the fail-safe (🔴 red, full set) and note that tags could not be read. Never assume green.
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
