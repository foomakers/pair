# CP9 — Quickstart Onboarding (timed)

**Priority**: P1
**Scope**: `/pair-process-bootstrap $mode: quick` — a project with a PRD but no adoption files reaches a first workable story in under 10 minutes, and the guided depth still behaves as before
**Preconditions**: Working CLI binary (from CP2), `$CLI` = path to that binary. `$WORKDIR` created outside the repo. An AI assistant session with the pair skills installed (`.claude/skills/`), able to run `/pair-process-bootstrap`. **A populated `.pair/adoption/product/PRD.md` in the project under test** — authored in MT-CP902, deliberately **outside** the stopwatch: bootstrap Phase 0 is blocking in both depths and composes the interactive `/pair-process-specify-prd` when the PRD is missing or still a template, which is a PRD-authoring session, not a bootstrap question.

**Why timed**: the quick depth exists to make the time-to-first-story short enough to be measured. The target is the acceptance criterion, so it is asserted here rather than assumed.

---

## Variables

| Variable   | How to resolve                                                                    |
| ---------- | --------------------------------------------------------------------------------- |
| `$WORKDIR` | Temp directory **outside** the repo: `mktemp -d /tmp/pair-quickstart-test.XXXXX`  |
| `$CLI`     | Path to the working `pair-cli` binary under test (from CP2)                        |
| `$T0`      | Stopwatch start, captured as `date +%s` immediately before MT-CP903 step 1         |
| `$T1`      | Split: captured when bootstrap reports `BOOTSTRAP COMPLETE` (**bootstrap-elapsed**) |
| `$T2`      | Stop: captured when the first workable story exists (**story-elapsed** = `T2 - T1`) |

**Stopwatch protocol** — the elapsed time must be measured, never estimated, and is recorded as **two splits** so a slow run points at the phase that caused it:

1. Before the timed step: `T0=$(date +%s)`
2. At `BOOTSTRAP COMPLETE`: `T1=$(date +%s)`
3. When the first story exists: `T2=$(date +%s)`
4. Report both splits and the total:

   ```bash
   fmt() { echo "$(( $1 / 60 ))m $(( $1 % 60 ))s"; }
   echo "bootstrap: $(fmt $((T1 - T0))) · story: $(fmt $((T2 - T1))) · total: $(fmt $((T2 - T0)))"
   ```

5. Record all three values in the report. Human think-time counts — this measures onboarding, not machine speed.

---

## MT-CP901: Empty project, KB installed

**Priority**: P1
**Preconditions**: `$WORKDIR` exists
**Category**: Onboarding

### Steps

1. `mkdir -p $WORKDIR/quickstart && cd $WORKDIR/quickstart && git init`
2. `$CLI install`
3. `ls .pair/adoption/tech/`

### Expected Result

- Exit code 0
- `.pair/knowledge/` and `.claude/skills/pair-process-bootstrap/SKILL.md` exist
- `.pair/adoption/tech/` holds templates only — no populated adoption file (this is a genuinely empty project)

---

## MT-CP902: PRD authored — outside the stopwatch

**Priority**: P1
**Preconditions**: MT-CP901 passes
**Category**: Onboarding

### Steps

1. In the AI session rooted at `$WORKDIR/quickstart`, run `/pair-process-specify-prd` and author a small PRD (a one-page product is enough: users, constraints, three P0 features)
2. `grep -c "\[Product/feature name\]" .pair/adoption/product/PRD.md` — expect `0`

### Expected Result

- `.pair/adoption/product/PRD.md` exists and is populated (no template placeholders left)
- The PRD session is **not** timed and **not** counted as a bootstrap question: Phase 0 is identical in both depths, and a populated PRD is the documented precondition of the minutes-scale claim (`quick-mode-defaults.md` § Still asked in quick mode)

### Notes

- Skipping this test and starting MT-CP903 on a template PRD is a **different** scenario: bootstrap will correctly compose the PRD interview inside the measured window, and the measurement is then meaningless for AC1.

---

## MT-CP903: Quick mode reaches a first workable story in under 10 minutes

**Priority**: P1
**Preconditions**: MT-CP902 passes
**Category**: Onboarding
**Target**: under 10 min elapsed total, wall-clock, split into bootstrap-elapsed + story-elapsed

### Steps

1. `T0=$(date +%s)` — start the stopwatch
2. In the AI session rooted at `$WORKDIR/quickstart`, run `/pair-process-bootstrap $mode: quick`
3. Answer only the questions bootstrap actually asks. Per `quick-mode-defaults.md` these are at most two: the PM tool, and the tech stack if it cannot be detected. Answer them immediately — deliberating is out of scope for the measurement
4. When bootstrap reports `BOOTSTRAP COMPLETE`: `T1=$(date +%s)` — bootstrap split
5. Run `/pair-next` and follow its suggestion until one user story with acceptance criteria exists in the tracker. This routes through the planning and refinement skills (`/pair-process-plan-*`, `/pair-process-refine-story`), which **are interactive by design** — their turns are expected here and are counted in story-elapsed
6. `T2=$(date +%s)` and print the two splits + total (see the stopwatch protocol)

### Expected Result

- Total elapsed under **10 min**, with both splits recorded
- **Bootstrap asked no question outside the two still-asked decisions** — no categorization confirmation, no per-section interview, no per-document approval round, no custom-gate question. This assertion is scoped to bootstrap (the `T0 → T1` window); the planning/refinement turns in step 5 are interactive and not covered by it
- The completion summary reports `Mode: quick — N questions asked` with `N` matching what was actually asked
- `.pair/adoption/tech/architecture.md`, `tech-stack.md` and `way-of-working.md` are populated
- One user story exists and is workable (it has acceptance criteria, so `/pair-process-implement` can start on it)

### Notes

- If the run exceeds the target, the two splits are the report: which of bootstrap or story-authoring consumed the time. A failure without the breakdown is not actionable.

---

## MT-CP904: Every file quick mode wrote is a normal adoption file

**Priority**: P1
**Preconditions**: MT-CP903 passes
**Category**: Onboarding

### Steps

1. `cd $WORKDIR/quickstart`
2. `ls .pair/adoption/tech/ .pair/adoption/decision-log/`
3. `grep -rniE "quick[- ]mode|generated by quick" .pair/adoption/ | head`
4. Edit one value in `.pair/adoption/tech/tech-stack.md` by hand, then run `/pair-next`

### Expected Result

- Adoption files sit in their normal locations, in the same format the guided depth produces (no extra directory, no sidecar file)
- Step 3 finds **no** quick-mode-only marker, flag, or format inside `.pair/adoption/`
- The hand edit survives, and `/pair-next` reads the edited value — a quick-mode default is editable exactly like any other adopted decision

---

## MT-CP905: Guided remains the default — no regression

**Priority**: P1
**Preconditions**: MT-CP901 passes, in a **second** clean project
**Category**: Regression

### Steps

1. `mkdir -p $WORKDIR/guided && cd $WORKDIR/guided && git init && $CLI install`
2. Author a PRD as in MT-CP902 (so Phase 0 is satisfied and the comparison is apples-to-apples)
3. In the AI session rooted at `$WORKDIR/guided`, run `/pair-process-bootstrap` with **no** `$mode` argument
4. Observe the first three interactions

### Expected Result

- The **guided** interview runs: Phase 0 PRD verification (skipped as already populated), then the Step 1.2 categorization confirmation question, then the Step 2.3 per-section questions
- The skill asks rather than assuming — an omitted `$mode` behaves exactly as it did before quick mode existed
- The completion summary reports `Mode: guided (default)`
- Running `/pair-process-bootstrap $mode: guided` explicitly is accepted and behaves identically to the omitted argument (the documented loud no-op)

### Notes

- This is the additive-change guard: quick mode must not have changed the no-argument path.

---

## MT-CP906: No TTY can never hang

**Priority**: P2
**Preconditions**: MT-CP901 passes
**Category**: Edge case

### Steps

1. Simulate a non-interactive environment (CI runner, or an agent session with stdin closed) rooted at a third clean project
2. Request the guided depth explicitly

### Expected Result

- Guided does not run: the skill warns that no TTY is available and runs the quick depth instead
- The run never blocks waiting for input that cannot arrive
- If a still-asked decision (PM tool, undetectable stack) is then unresolvable, the run **HALTs** and names the input to pass explicitly — it does not guess

---

## Changelog

- Added for #278 (bootstrap quick mode): MT-CP901..906.
- Review round 1 (#408): added MT-CP902 (PRD authored outside the stopwatch) — the PRD is a third question-generating input, not a quick-mode default; the timed test is now MT-CP903 with a bootstrap/story split, and its "no question" assertion is scoped to the bootstrap window.
