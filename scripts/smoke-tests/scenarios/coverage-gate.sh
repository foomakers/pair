#!/usr/bin/env bash
OFFLINE_SAFE=true
#
# Coverage baseline + CI guardrail — verification scenario (story #282).
#
# Exercises the shipped, provider-agnostic coverage guardrail end-to-end and
# audits the guideline for the non-negotiable properties:
#   1. a regression below the established baseline BLOCKS (fails) at every tier;
#   2. maintaining or improving coverage PASSES (guardrail, not an absolute wall);
#   3. per-type targets select the threshold matching the touched code's type;
#   4. baseline bootstrapping is ADVISORY on first run / when missing / when
#      corrupt — it SUGGESTS a value on stderr and passes without persisting
#      (a CI checkout is ephemeral; the baseline is human-committed, see #372),
#      instead of blocking everything at 0;
#   5. a missing coverage report fails safe: BLOCKS at red tier, WARNS at lower
#      tiers, never a silent pass;
#   6. the guardrail reads adoption config + a coverage number only — it carries NO
#      classification criteria (D18): it never inspects the diff, code, or paths.
#
# It also DEMONSTRATES the opt-in commit-back ratchet (story #372) end-to-end
# through its CLI — the loop-termination sequence (AC4) is run, not asserted in
# prose: enabled ⇒ raise proposed, then the automated commit is skipped, and even
# with the marker lost the fixpoint proposes nothing. Plus AC1 (default off),
# AC3 (never lowers), AC5 (a PR run never writes) and AC6 (a refused write is a
# warning that leaves the verdict untouched).
#
# Per the gate-tooling ADL (2026-07-13) this shell/asset surface is verified with a
# smoke test, not a vitest unit test.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Coverage Baseline + CI Guardrail"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
GATE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-gate.sh"
GUIDELINE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md"
EXAMPLE="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-config-example.md"

FAILED=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then log_succ "$1 => $3"; else log_fail "$1: expected '$2' got '$3'"; FAILED=1; fi
}
pass() { # pass <description> <cmd...> — expects exit 0
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then log_succ "$desc (passed as expected)"; else log_fail "$desc: expected pass (exit 0) got fail"; FAILED=1; fi
}
block() { # block <description> <cmd...> — expects non-zero exit
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then log_fail "$desc: expected BLOCK (exit!=0) got pass"; FAILED=1; else log_succ "$desc (blocked as expected)"; fi
}

assert_file "$GATE" || exit 1
assert_file "$GUIDELINE" || exit 1
assert_file "$EXAMPLE" || exit 1

# shellcheck source=/dev/null
source "$GATE"

# --- Config fixture: per-type targets + an established baseline (parseable lines
# that also live verbatim inside the adoption markdown's fenced config block) ---
CFG="$TMP_DIR/coverage-baseline.md"
cat >"$CFG" <<'EOF'
# Coverage config (fixture)
```ini
target.default=70
target.backend=80
target.frontend=60
target.shared=90
exclude=**/*.generated.ts
baseline.default=75
baseline.backend=82.5
baseline.frontend=61
```
EOF

# --- Per-type target selection (AC5) ---
check "target backend"          80 "$(target_for_type "$CFG" backend)"
check "target frontend"         60 "$(target_for_type "$CFG" frontend)"
check "target shared"           90 "$(target_for_type "$CFG" shared)"
check "target unknown->default" 70 "$(target_for_type "$CFG" mystery)"

# --- Baseline read ---
check "baseline backend" 82.5 "$(baseline_for_type "$CFG" backend)"

# --- CRLF-authored config: a trailing CR must NOT corrupt a human-committed
# baseline (Minor fix — Windows/autocrlf checkout). baseline.backend=82.5\r must
# read as 82.5, so 80 < 82.5 still BLOCKS instead of silently re-bootstrapping. ---
CRLF="$TMP_DIR/coverage-crlf.md"
printf 'target.backend=80\r\nbaseline.backend=82.5\r\n' >"$CRLF"
check "CRLF baseline read as number"              82.5 "$(baseline_for_type "$CRLF" backend)"
block "CRLF baseline honored (80 < 82.5 blocks)"  coverage_gate red backend 80 "$CRLF"

# --- Regression blocks; maintain/improve passes (AC1/AC2) — at EVERY tier ---
block "green: backend 80 < baseline 82.5 blocks"   coverage_gate green  backend 80    "$CFG"
block "yellow: backend 80 < baseline 82.5 blocks"  coverage_gate yellow backend 80    "$CFG"
block "red: backend 80 < baseline 82.5 blocks"     coverage_gate red    backend 80    "$CFG"
pass  "backend 82.5 == baseline passes"            coverage_gate yellow backend 82.5  "$CFG"
pass  "backend 90 > baseline passes"               coverage_gate yellow backend 90    "$CFG"
pass  "frontend 61 == baseline passes"             coverage_gate yellow frontend 61   "$CFG"

# --- Missing coverage report: fail-safe by tier (edge case) ---
block "red + no report blocks (fail-safe)"         coverage_gate red    backend ""    "$CFG"
pass  "yellow + no report warns (no block)"        coverage_gate yellow backend ""    "$CFG"
pass  "green + no report warns (no block)"         coverage_gate green  backend ""    "$CFG"
# missing report must warn on stderr (never silently pass)
if coverage_gate yellow backend "" "$CFG" 2>&1 >/dev/null | grep -qi 'not measured\|no coverage'; then
  log_succ "missing report warns on stderr"
else
  log_fail "missing report did not warn"; FAILED=1
fi

# --- Baseline bootstrapping is ADVISORY (AC4 + persistence=A): no committed
# baseline => the gate SUGGESTS a value on stderr and PASSES, but does NOT persist
# it (a CI checkout is ephemeral; a human commits it — see #372). ---
BOOT="$TMP_DIR/coverage-bootstrap.md"
cat >"$BOOT" <<'EOF'
```ini
target.default=70
```
EOF
BOOT_BEFORE="$(cat "$BOOT")"
pass  "no baseline -> advisory pass, does not block" coverage_gate red backend 55 "$BOOT"
if coverage_gate red backend 55 "$BOOT" 2>&1 >/dev/null | grep -q 'baseline.backend=55'; then
  log_succ "bootstrap SUGGESTS baseline.backend=55 on stderr"
else
  log_fail "bootstrap did not suggest a baseline on stderr"; FAILED=1
fi
if [ "$(cat "$BOOT")" = "$BOOT_BEFORE" ]; then
  log_succ "bootstrap did NOT persist to the config (advisory-only; ephemeral-safe)"
else
  log_fail "bootstrap wrote to the config (must be advisory-only)"; FAILED=1
fi

# --- Corrupt baseline is advisory too: pass without blocking AND without
# overwriting the (corrupt) committed value on its own (edge case). ---
CORRUPT="$TMP_DIR/coverage-corrupt.md"
cat >"$CORRUPT" <<'EOF'
```ini
baseline.backend=not-a-number
```
EOF
CORRUPT_BEFORE="$(cat "$CORRUPT")"
pass  "corrupt baseline -> advisory pass, no block" coverage_gate red backend 70 "$CORRUPT"
if [ "$(cat "$CORRUPT")" = "$CORRUPT_BEFORE" ]; then
  log_succ "corrupt baseline NOT overwritten by the gate (advisory-only)"
else
  log_fail "corrupt baseline was overwritten (must be advisory-only)"; FAILED=1
fi

# --- Grep audit: the gate carries NO classification criteria (D18). It reads the
# adoption config and a coverage number — it never inspects the diff/code/paths. ---
CRITERIA='\b(git diff|--numstat|files?[ -]changed|risk:(green|yellow|red)|schema|migration)\b'
if grep -Eiq "$CRITERIA" "$GATE"; then
  log_fail "coverage gate leaks classification criteria"; grep -Ein "$CRITERIA" "$GATE"; FAILED=1
else
  log_succ "coverage gate contains no classification criteria"
fi

# --- Guideline audit: the coverage guardrail is documented as a job consumed by
# THIS pipeline (AC3), baseline-relative (regression), with per-type targets and
# fail-safe behavior. ---
if grep -qi 'coverage guardrail' "$GUIDELINE" \
  && grep -qi 'baseline' "$GUIDELINE" \
  && grep -qi 'regression' "$GUIDELINE"; then
  log_succ "guideline documents the coverage guardrail (baseline/regression)"
else
  log_fail "guideline missing coverage guardrail documentation"; FAILED=1
fi

# --- Opt-in audit (default off): the guardrail must be documented as opt-in in
# both the guideline and the docs, and its persistence model must be advisory /
# human-committed — the Major fix (persistence=A). ---
if grep -qi 'opt-in' "$GUIDELINE" \
  && grep -Eqi 'human-committed|human commits|bootstrap-only' "$GUIDELINE"; then
  log_succ "guideline documents opt-in + advisory/human-committed persistence"
else
  log_fail "guideline missing opt-in / persistence documentation"; FAILED=1
fi

# --- Example audit: persistence=A (human-committed, advisory, plus the nested
# commit-back opt-in and the credential the ADOPTER provisions) and the
# exclude-is-adopter-applied clarification. The commit-back grep names the
# CAPABILITY, not the story that shipped it: a bare issue number has no referent
# for the adopter reading this file, and it goes stale the moment the story does. ---
if grep -Eqi 'human-committed|bootstrap-only' "$EXAMPLE" \
  && grep -q 'COVERAGE_RATCHET_TOKEN' "$EXAMPLE" \
  && grep -q 'coverage-ratchet' "$EXAMPLE" \
  && grep -qi 'applied by the adopter' "$EXAMPLE"; then
  log_succ "example documents persistence=A + the commit-back command/credential + exclude adopter-applied"
else
  log_fail "example missing persistence / exclude clarification"; FAILED=1
fi

# --- The generated workflow's measure step, EXECUTED as GitHub Actions would run
# it (`bash -e`), with NO coverage report present — the most common state for an
# adopter who has not adapted the report path yet.
#
# The snippet is extracted from the SHIPPED guideline rather than retyped here: a
# copy would pass while the shipped text aborts, which is exactly the class of
# miss a text assertion cannot see. Invariants: exit 0 (the workflow gates
# nothing and must not redden the base branch), the "no usable coverage" warning
# is reachable, and the measured list comes out EMPTY so the write step's
# `if: env.PAIR_MEASURED != ''` skips the invocation. ---
MEASURE_SNIPPET="$TMP_DIR/measure-step.sh"
awk '/^      - id: measure$/{f=1;next} /^      - name: Coverage baseline commit-back/{f=0} f' \
  "$GUIDELINE" | sed -e 's/^        run: |$//' -e 's/^          //' >"$MEASURE_SNIPPET"
if [ ! -s "$MEASURE_SNIPPET" ]; then
  log_fail "could not extract the measure step from the guideline — repoint this check"; FAILED=1
else
  MEASURE_DIR="$TMP_DIR/measure-run"
  rm -rf "$MEASURE_DIR"; mkdir -p "$MEASURE_DIR"
  # `GITHUB_ENV` is a real file here, as on a runner: the step appends to it.
  if OUT="$(cd "$MEASURE_DIR" && GITHUB_ENV="$MEASURE_DIR/github_env" bash -e "$MEASURE_SNIPPET" 2>&1)"; then
    log_succ "measure step survives a missing report under bash -e (workflow does not go red)"
  else
    log_fail "measure step ABORTED with no report — the adopter's base branch goes red on every push"
    echo "$OUT" | sed 's/^/      | /'; FAILED=1
  fi
  # Checked inline: `expect_out` is defined further down, in the ratchet section,
  # so calling it here would be an unset command — a silently skipped assertion.
  case "$OUT" in
  *"no usable coverage"*) log_succ "missing report warns per type, reachably" ;;
  *)
    log_fail "the per-type warning never printed — unreachable branch"
    echo "$OUT" | sed 's/^/      | /'; FAILED=1
    ;;
  esac
  if [ "$(cat "$MEASURE_DIR/github_env" 2>/dev/null)" = "PAIR_MEASURED=" ]; then
    log_succ "nothing measured => empty list, so the write step's if: skips the invocation"
  else
    log_fail "expected an empty PAIR_MEASURED, got: $(cat "$MEASURE_DIR/github_env" 2>/dev/null)"; FAILED=1
  fi
fi

# --- Same invariant, the OTHER generated snippet: the PRE-MERGE coverage step,
# also executed as Actions would (`bash -e`) with no report present. Here the
# consequence of aborting is different and worse-looking: the step would die
# BEFORE `coverage_gate` is called, so this guideline's own documented fail-safe
# (block at red, WARN at lower tiers on an unmeasured report) would be
# unreachable and a yellow PR blocked where the corpus promises a warning.
#
# The one GitHub expression in the block is substituted with a tier, since a
# runner would have substituted it before the shell ever saw it. ---
GATE_SNIPPET="$TMP_DIR/premerge-coverage-step.sh"
# From the `source coverage-gate.sh` line to the end of that run-block body,
# anchored on the body's 10-space indentation — so the extraction stops at the
# next YAML key instead of running to EOF.
awk '/source \.pair\/knowledge\/assets\/coverage-gate\.sh/{f=1} f{ if ($0 !~ /^          / && $0 != "") exit; print }' \
  "$GUIDELINE" |
  sed -e 's/^          //' -e "s/\${{ needs.resolve-tier.outputs.tier }}/yellow/" >"$GATE_SNIPPET"
if ! grep -q 'coverage_gate' "$GATE_SNIPPET"; then
  log_fail "could not extract the pre-merge coverage step from the guideline — repoint this check"; FAILED=1
else
  if OUT="$(cd "$REPO_ROOT" && bash -e "$GATE_SNIPPET" 2>&1)"; then
    log_succ "pre-merge coverage step survives a missing report under bash -e (reaches the gate)"
  else
    log_fail "pre-merge coverage step ABORTED before coverage_gate — the documented fail-safe is unreachable"
    echo "$OUT" | sed 's/^/      | /'; FAILED=1
  fi
  case "$OUT" in
  *"not measured"*) log_succ "pre-merge step reaches the fail-safe and WARNS at yellow (not blocks)" ;;
  *)
    log_fail "the yellow-tier warning never printed — the fail-safe was not reached"
    echo "$OUT" | sed 's/^/      | /'; FAILED=1
    ;;
  esac
fi

# --- "machine-maintained" wording must be gone from the shipped assets (Major fix). ---
if grep -qi 'machine-maintained' "$GATE" "$EXAMPLE" "$GUIDELINE"; then
  log_fail "'machine-maintained' wording still present (should be removed)"; FAILED=1
else
  log_succ "no misleading 'machine-maintained' wording remains"
fi

# ===========================================================================
# Commit-back ratchet (story #372) — shipped-asset demonstration (ADR-023)
#
# The ratchet's decisions live in the unit-tested module
# packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts; what is proven
# HERE is the shipped wiring and, above all, that the CI LOOP TERMINATES (AC4)
# — run as a real sequence, not asserted in prose.
#
# THE ENTRYPOINT EXERCISED IS THE ADOPTER'S (story #409, ADR-023): the generated
# KB asset `node .pair/knowledge/assets/coverage-ratchet.cjs` — exactly what an
# adopter's generated pipeline step invokes. Before #409 the only way to run the
# ratchet was a `pnpm --filter` inside this monorepo — the reachability gap that
# made `Coverage baseline commit-back: enabled` a silent no-op for everyone
# else; ADR-023 closes it without adding a CLI command.
#
# Every invocation is either `--dry-run` or a path that refuses before writing,
# so this scenario can create no git/gh side effect. Fixtures are temp files.
# ===========================================================================
RATCHET_DIR="$TMP_DIR/ratchet"
mkdir -p "$RATCHET_DIR"
R_CFG="$RATCHET_DIR/coverage-baseline.md"
R_WOW="$RATCHET_DIR/way-of-working.md"

write_ratchet_cfg() { # write_ratchet_cfg <shared-baseline>
  cat >"$R_CFG" <<EOF
# coverage config (fixture) — surrounding markdown MUST survive untouched

\`\`\`ini
target.shared=90
baseline.shared=$1
baseline.frontend=19
\`\`\`

## Notes

- trailing prose
EOF
}
write_ratchet_wow() { # write_ratchet_wow <enabled|disabled>
  printf -- '- **Coverage guardrail**: `enabled`\n- **Coverage baseline commit-back**: `%s`\n' "$1" >"$R_WOW"
}

# How the ratchet is invoked: the packaged CLI the runner already resolved
# ADR-023: the entrypoint is the installed KB asset, not the CLI — an adopter's
# generated step invokes `node <their .pair>/knowledge/assets/coverage-ratchet.cjs`,
# so this scenario always exercises that same relative path from pair's own
# installed copy.
RATCHET_CLI="node $REPO_ROOT/.pair/knowledge/assets/coverage-ratchet.cjs"

# ratchet <event> <ref> <head-commit-message> <measured-shared> [extra-args...]
# Echoes the CLI's combined output; always run WITHOUT a token in the env.
ratchet() {
  local event="$1" ref="$2" msg="$3" pct="$4"; shift 4
  (
    cd "$REPO_ROOT" || exit 1
    # `INIT_CWD` leaks the `pnpm smoke-tests` invoker's directory into the CLI;
    # the ratchet anchors itself to the repo root and needs neither.
    env -u COVERAGE_RATCHET_TOKEN -u INIT_CWD \
      GITHUB_EVENT_NAME="$event" \
      GITHUB_REF_NAME="$ref" \
      PAIR_RATCHET_HEAD_COMMIT_MESSAGE="$msg" \
      $RATCHET_CLI \
      --config "$R_CFG" \
      --way-of-working "$R_WOW" \
      --base-branch main \
      --measured "shared=$pct" \
      "$@" 2>&1
  )
}
expect_out() { # expect_out <description> <needle> <output>
  case "$3" in
  *"$2"*) log_succ "$1" ;;
  *) log_fail "$1: output did not contain '$2'"; echo "$3" | sed 's/^/      | /'; FAILED=1 ;;
  esac
}
refute_out() { # refute_out <description> <needle> <output>
  case "$3" in
  *"$2"*) log_fail "$1: output unexpectedly contained '$2'"; FAILED=1 ;;
  *) log_succ "$1" ;;
  esac
}
# cfg_untouched <description> — the fixture config is byte-identical to $CFG_BEFORE
# (compared quietly: `check` would echo the whole file on every pass).
cfg_untouched() {
  if [ "$CFG_BEFORE" = "$(cat "$R_CFG")" ]; then
    log_succ "$1"
  else
    log_fail "$1: the config was modified"; diff <(printf '%s' "$CFG_BEFORE") "$R_CFG" || true; FAILED=1
  fi
}

if ! ${RATCHET_CLI} --dry-run >/dev/null 2>&1 && ! ${RATCHET_CLI} --config /dev/null >/dev/null 2>&1; then
  # Either flag proves the asset executes: --dry-run is a no-op run, a missing
  # config exits non-zero but only AFTER the module loaded and parsed argv.
  log_fail "shipped ratchet asset not runnable ($RATCHET_CLI)"; FAILED=1
else
  write_ratchet_cfg 84

  # --- #409 / ADR-023: the asset an adopter's generated step names IS the file
  # `pair install` ships — reachable at the documented relative path, no CLI
  # command, no npm round-trip. Before this, the ratchet could only be run
  # through a pnpm filter inside pair's own monorepo, so the flag was documented
  # and the capability was not there. ---
  expect_out "the shipped ratchet asset is installed at the documented path" "GENERATED FILE" "$(cat "$REPO_ROOT/.pair/knowledge/assets/coverage-ratchet.cjs")"

  # --- #409: a malformed invocation fails LOUDLY (non-zero), which is the exact
  # counterpart of the run itself never failing: an authoring mistake must not
  # look like "nothing to raise". ---
  if (cd "$REPO_ROOT" && env -u INIT_CWD ${RATCHET_CLI} coverage-ratchet --way-of-working "$R_WOW" >/dev/null 2>&1); then
    log_fail "an invocation with nothing measured exited 0 — a no-op that looks like success"; FAILED=1
  else
    log_succ "an invocation with nothing measured exits non-zero (authoring bug, not a silent no-op)"
  fi

  # --- AC1: default off. The flag is `disabled` => nothing is written and the
  # step only says why (the framework default is the same, absent flag). ---
  write_ratchet_wow disabled
  CFG_BEFORE="$(cat "$R_CFG")"
  OUT="$(ratchet push main 'feat: unrelated work' 90.5 --dry-run)"
  expect_out "AC1 flag disabled -> skipped" "SKIPPED (flag-disabled)" "$OUT"
  cfg_untouched "AC1 config untouched"

  # --- From here the flag is enabled. ---
  write_ratchet_wow enabled

  # --- AC5: a pull-request run NEVER writes back (fork or not). ---
  OUT="$(ratchet pull_request feature/US-1-foo 'feat: from a PR' 90.5 --dry-run)"
  expect_out "AC5 pull_request run -> skipped" "SKIPPED (not-base-push)" "$OUT"
  OUT="$(ratchet push feature/US-1-foo 'feat: branch push' 90.5 --dry-run)"
  expect_out "AC5 non-base push -> skipped" "SKIPPED (not-base-push)" "$OUT"

  # --- AC2: a base-branch push above the baseline PROPOSES a raise, as a bot PR
  # on a dedicated branch — never a push to the base branch. ---
  OUT="$(ratchet push main 'feat: improved coverage' 90.5 --dry-run)"
  expect_out "AC2 raise planned (84 -> 89)"      "shared — raise"                    "$OUT"
  expect_out "AC2 lands on the ratchet branch"   "HEAD:refs/heads/chore/coverage-baseline-ratchet" "$OUT"
  expect_out "AC2 opens a PR against the base"   "gh pr create --base main"          "$OUT"
  expect_out "AC2 pushes with a lease, not a bare force" "push --force-with-lease"    "$OUT"
  # The lease is only meaningful if the destination has a remote-tracking ref: a
  # CI checkout fetches the base ref only, and without this git rejects every
  # non-fast-forward lease push as 'stale info' (the ratchet would work once,
  # then warn forever). The fetch itself is tolerated — first run, no branch yet.
  #
  # The mapping is TRANSIENT (`git -c <key>=<refspec>`), not persisted with
  # `config --add`: the module leaves the job's checkout config untouched, and its
  # unit tests assert exactly that (coverage-ratchet/ratchet.test.ts). The two
  # assertions below were written against the `config --add` spelling and were
  # never executed — this scenario was committed mode 644 (#400), so the change of
  # spelling in #405 could not be caught here. Realigned to the decided behaviour,
  # refutation included, so the transient form is now the asserted one.
  expect_out "AC2 maps a remote-tracking ref for the lease" \
    "-c remote.origin.fetch=+refs/heads/chore/coverage-baseline-ratchet" "$OUT"
  refute_out "AC2 does not persist the refspec in the checkout config" \
    "config --add remote.origin.fetch" "$OUT"
  expect_out "AC2 fetch failure is tolerated"     "fetch --no-tags origin"            "$OUT"
  expect_out "AC2 restores the checkout afterwards" "restores the workspace"          "$OUT"
  refute_out "AC2 never pushes to the base ref"  "refs/heads/main"                    "$OUT"
  refute_out "AC2 never stages everything"       "git add -A"                         "$OUT"
  # Branch switching, precisely: `git checkout <branch>` / `git switch` / `git branch`.
  # A bare `git checkout` substring also matches the restore step's `git checkout --
  # <configPath>`, which reverts ONE file and switches nothing — so the coarse form
  # forbade the very cleanup the module documents (and its unit test asserts).
  refute_out "AC2 never switches to a bot branch"  "git checkout chore/"              "$OUT"
  refute_out "AC2 never uses git switch"           "git switch"                       "$OUT"
  refute_out "AC2 creates no local branch"         "git branch"                       "$OUT"
  cfg_untouched "AC2 dry run wrote nothing"

  # === AC4 — LOOP TERMINATION, demonstrated as a sequence ===
  # Round 2a: the run reacting to the ratchet's own commit (squash subject taken
  # from the ratchet PR title, so it carries the marker) must NOT propose again.
  OUT="$(ratchet push main 'chore: ratchet coverage baseline [coverage-baseline-ratchet] (#999)' 90.5 --dry-run)"
  expect_out "AC4 marked commit -> skipped" "SKIPPED (automated-commit)" "$OUT"
  # Round 2b: a plain merge commit, whose subject GitHub generates WITHOUT the
  # PR title — caught by the ratchet branch name.
  OUT="$(ratchet push main 'Merge pull request #999 from foomakers/chore/coverage-baseline-ratchet' 90.5 --dry-run)"
  expect_out "AC4 merge commit -> skipped" "SKIPPED (automated-commit)" "$OUT"
  # Round 2c: the guarantee that does NOT depend on the marker surviving — the
  # ratchet is a FIXPOINT. With the raise merged (baseline now 89) and the same
  # coverage measured, a HUMAN commit message proposes nothing at all.
  write_ratchet_cfg 89
  OUT="$(ratchet push main 'feat: another human change' 90.5 --dry-run)"
  expect_out "AC4 fixpoint -> no raise even from a human commit" "no raise" "$OUT"
  refute_out "AC4 fixpoint plans no commands" "DRY RUN" "$OUT"

  # --- AC3: never lowers. Equal and below both hold. ---
  write_ratchet_cfg 84
  OUT="$(ratchet push main 'feat: coverage exactly at the baseline' 84 --dry-run)"
  expect_out "AC3 equal coverage -> no raise" "no raise" "$OUT"
  OUT="$(ratchet push main 'feat: coverage dropped' 40 --dry-run)"
  expect_out "AC3 drop -> hold, never lowered" "shared — hold" "$OUT"
  cfg_untouched "AC3 config untouched by a drop"

  # --- MULTI-TYPE, the dimension a generated workflow gets wrong by passing a
  # single hardcoded `default=`: a config with TWO committed baselines must see
  # BOTH raised from one invocation, each against its own committed value. ---
  OUT="$(ratchet push main 'feat: both types improved' 90.5 --measured shared=90.5,frontend=80 --dry-run)"
  expect_out "multi-type: shared raised on its own baseline"   "shared — raise"   "$OUT"
  expect_out "multi-type: frontend raised on its own baseline" "frontend — raise" "$OUT"
  expect_out "multi-type: one commit carries both raises" "shared 84->89, frontend 19->79" "$OUT"
  cfg_untouched "multi-type dry run wrote nothing"

  # --- Edge case: a type measured but absent from the config is reported, never written.
  # The second `--measured` supersedes the helper's own (last flag wins), so the
  # list passed here is the whole measured set for this invocation. ---
  OUT="$(ratchet push main 'feat: new package' 90.5 --measured shared=90.5,backend=77 --dry-run)"
  expect_out "unknown type -> reported, not written" "backend — no-baseline-configured" "$OUT"

  # --- AC6: a refused write (no credential) degrades to a WARNING, exits 0 and
  # writes nothing. Run WITHOUT --dry-run: this is the real write path refusing. ---
  if OUT="$(ratchet push main 'feat: improved coverage' 90.5)"; then
    log_succ "AC6 refused write still exits 0 (gate verdict untouched)"
  else
    log_fail "AC6 refused write exited non-zero — it must never fail the run"; FAILED=1
  fi
  expect_out "AC6 warns rather than failing"      "::warning::"              "$OUT"
  expect_out "AC6 names the reason (credential)"  "COVERAGE_RATCHET_TOKEN"   "$OUT"
  cfg_untouched "AC6 nothing written on refusal"
fi

# --- Audit: the decided PR-vs-push model + the credential requirement are
# documented where a consumer reads them (guideline + adoption), not only in the
# workflow YAML (#372 DoD). ---
WOW="$REPO_ROOT/.pair/adoption/tech/way-of-working.md"
if grep -qi 'coverage baseline commit-back' "$GUIDELINE" \
  && grep -q 'COVERAGE_RATCHET_TOKEN' "$GUIDELINE" \
  && grep -q 'chore/coverage-baseline-ratchet' "$GUIDELINE"; then
  log_succ "guideline documents the commit-back flag, its credential and the bot-PR model"
else
  log_fail "guideline missing commit-back flag / credential / bot-PR documentation"; FAILED=1
fi
if grep -qi 'Coverage baseline commit-back' "$WOW" && grep -q 'COVERAGE_RATCHET_TOKEN' "$WOW"; then
  log_succ "adoption line declares the commit-back flag + its credential"
else
  log_fail "adoption way-of-working missing the commit-back flag"; FAILED=1
fi
# The gate itself must still never persist, in any configuration.
if grep -q 'NEVER WRITES' "$GATE"; then
  log_succ "gate still declares it never writes (persistence stays a separate side effect)"
else
  log_fail "gate no longer states that it never writes"; FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
