#!/usr/bin/env bash
OFFLINE_SAFE=true
#
# Formatter wrappers delegate to .gitignore — verification scenario (story #394).
#
# ADL 2026-07-31-pre-push-gate-is-check-only makes "gitignored => never
# formatted/checked" a CORRECTNESS requirement, not a nicety: since the pre-push gate
# runs the formatters in CHECK mode, a generated artifact no longer gets silently
# rewritten — it BLOCKS every push. The four wrappers implement that by passing the
# repo's own .gitignore files as ignore sources.
#
# That mechanism had no automated coverage: a one-line revert, or a `git rev-parse`
# failure path, silently re-arms the blocked push, and the gate stays green (the
# gate:composition guard inspects package.json scripts only, never the wrappers).
#
# Asserts, per tool and for BOTH check and fix (the ADL requires them to see the same
# file set), inside a throwaway git repo:
#   1. a badly formatted file under a gitignored directory is neither reported nor rewritten;
#   2. the same file OUTSIDE a gitignored path is reported / rewritten;
#   3. the gitignored path is PATH-ANCHORED (`pkg/gen/`) and the wrapper runs from
#      `pkg/`, which is where markdownlint needed the root patterns re-anchored to
#      the cwd (git resolves them against the ignore file's directory);
#   4. each wrapper EXITS on the violation path (status 1, no tool-error output) —
#      without that, a wrapper that dies (a config it cannot resolve, a flag a tool
#      version dropped) reports nothing about `gen/` and names `src/` inside its own
#      error text, so the text-only assertions pass on a fully broken wrapper. Check
#      mode is the mode the gate runs, so it must be the harder half to fool.
#
# Plus a table-driven check of `_reanchor-gitignore.awk` (pure text in / text out):
# its branches fail as an OVER-ignore — silently unformatted files, not a loud error —
# which is the failure mode hardest to notice.
#
# Per the gate-tooling ADL (2026-07-13) this shell surface is verified with a smoke
# test, not a vitest unit test.
#
# Story #414 added run-format.sh — root `format:check`/`format` now derive the file
# list via `git ls-files` (scripts/format-lib/git-tracked-paths.sh) instead of the
# wrappers' own ignore assembly. That did NOT replace the mechanism this file already
# verified: `--filter <pkg> prettier:check`/`mdlint:check` still call the wrappers with
# zero path arguments (glob mode), which still sources _ignore-args.sh/_ignore-file.sh
# exactly as before (#414's T-5 found removing them would break that live path). So the
# assertions above stand unchanged, and a second block below adds the same four
# guarantees against the git-delegated mechanism, run through run-format.sh.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Formatter Ignore Delegation (.gitignore)"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
PRETTIER_CHECK="$REPO_ROOT/tools/prettier-config/bin/prettier-check.sh"
PRETTIER_FIX="$REPO_ROOT/tools/prettier-config/bin/prettier-fix.sh"
MDLINT_CHECK="$REPO_ROOT/tools/markdownlint-config/bin/markdownlint-check.sh"
MDLINT_FIX="$REPO_ROOT/tools/markdownlint-config/bin/markdownlint-fix.sh"
REANCHOR_AWK="$REPO_ROOT/tools/markdownlint-config/bin/_reanchor-gitignore.awk"
RUN_FORMAT="$REPO_ROOT/scripts/format-lib/run-format.sh"

FAILED=0
for f in "$PRETTIER_CHECK" "$PRETTIER_FIX" "$MDLINT_CHECK" "$MDLINT_FIX" "$REANCHOR_AWK" "$RUN_FORMAT"; do
  assert_file "$f" || exit 1
done

# A wrapper that BROKE, as opposed to one that found violations. Both tools print the
# offending path inside their own error text, so status + this pattern are what keep a
# dead wrapper from passing the check-mode assertions.
TOOL_ERROR_RE='\[error\]|^Error:|ENOENT|Cannot find|No files matching'

assert_violations_reported() { # assert_violations_reported <tool> <status> <output>
  if [ "$2" -eq 1 ] && ! echo "$3" | grep -qE "$TOOL_ERROR_RE"; then
    log_succ "$1 exited 1 (violations found), not a tool error"
  else
    log_fail "$1 did not report violations cleanly — status $2 (1 = violations, else broken)"
    echo "$3"; FAILED=1
  fi
}

assert_exits_clean() { # assert_exits_clean <tool> <status> <output>
  if [ "$2" -eq 0 ] && ! echo "$3" | grep -qE "$TOOL_ERROR_RE"; then
    log_succ "$1 exited 0 with nothing to report"
  else
    log_fail "$1 did not exit clean — status $2"
    echo "$3"; FAILED=1
  fi
}

# --- A throwaway git repo: the wrappers read `git rev-parse --show-toplevel`, so the
# ignore delegation can be exercised without touching this repo's own .gitignore.
WORKSPACE="$(setup_workspace fmt-ignore-delegation)"
PROBE="$WORKSPACE/repo"
mkdir -p "$PROBE/pkg/gen" "$PROBE/pkg/src"
git -C "$PROBE" init --quiet

# PATH-ANCHORED on purpose: `gen/` alone would pass even without re-anchoring.
cat > "$PROBE/.gitignore" <<'EOF'
node_modules/
pkg/gen/
EOF

# HERMETIC: the workspace lives under this repo's own .tmp/, so without a config of
# its own prettier's discovery walks OUT of the fixture and resolves the pair repo's
# `package.json#prettier` — making the scenario depend on the outer repo's install
# state (that is how the reviewer saw prettier exit 2 here). A local package.json +
# .prettierrc.json stop the search inside the probe. markdownlint needs none: its
# wrapper passes --config explicitly.
printf '{ "name": "probe", "private": true }\n' > "$PROBE/package.json"
printf '{}\n' > "$PROBE/.prettierrc.json"

# Pristine copies on disk: comparison is `cmp`, not `$(cat)` — command substitution
# strips trailing newlines and would call every markdown file "rewritten".
# The .md carries trailing whitespace (MD009) and the .json bad spacing: both are
# reported in check mode and repaired in fix mode.
PRISTINE="$WORKSPACE/pristine"
mkdir -p "$PRISTINE"
printf '{"a":   1,"b":2}' > "$PRISTINE/bad.json"
printf '# Title   \n\ntext\n' > "$PRISTINE/bad.md"

write_probes() {
  local root=${1:-$PROBE}
  for dir in gen src; do
    cp "$PRISTINE/bad.json" "$root/pkg/$dir/bad.json"
    cp "$PRISTINE/bad.md" "$root/pkg/$dir/bad.md"
  done
}
write_probes

# --- CHECK mode: the ignored file must not be named, the tracked one must be ---
# Status FIRST: a text-only pass is exactly what a dead wrapper produces.
prettier_out="$(cd "$PROBE/pkg" && "$PRETTIER_CHECK" 2>&1)"
prettier_status=$?
assert_violations_reported prettier-check "$prettier_status" "$prettier_out"
if echo "$prettier_out" | grep -q 'gen/bad.json'; then
  log_fail "prettier-check reported a gitignored file (would block every push)"
  echo "$prettier_out"; FAILED=1
else
  log_succ "prettier-check ignores gen/bad.json (gitignored)"
fi
# `grep -x`: `--list-different` prints one path per line, so an exact line match cannot
# be satisfied by the path appearing inside an error message.
if echo "$prettier_out" | grep -qx 'src/bad.json'; then
  log_succ "prettier-check still reports src/bad.json (not ignored)"
else
  log_fail "prettier-check did not report src/bad.json — it now ignores too much"
  echo "$prettier_out"; FAILED=1
fi

mdlint_out="$(cd "$PROBE/pkg" && "$MDLINT_CHECK" 2>&1)"
mdlint_status=$?
assert_violations_reported markdownlint-check "$mdlint_status" "$mdlint_out"
if echo "$mdlint_out" | grep -q 'gen/bad.md'; then
  log_fail "markdownlint-check reported a gitignored file (would block every push)"
  echo "$mdlint_out"; FAILED=1
else
  log_succ "markdownlint-check ignores gen/bad.md (root pattern re-anchored to the cwd)"
fi
# The rule id, not just the path: markdownlint names the file in its error text too.
if echo "$mdlint_out" | grep -q 'src/bad.md.*MD009'; then
  log_succ "markdownlint-check still reports src/bad.md (not ignored)"
else
  log_fail "markdownlint-check did not report src/bad.md — it now ignores too much"
  echo "$mdlint_out"; FAILED=1
fi

# --- FIX mode: same file set, or the gate reports what `pnpm format` won't touch ---
assert_unchanged() { # assert_unchanged <tool> <file> <pristine>
  if cmp -s "$2" "$3"; then
    log_succ "$1 left ${2#"$PROBE/pkg/"} untouched (gitignored)"
  else
    log_fail "$1 rewrote a gitignored file (${2#"$PROBE/pkg/"})"; FAILED=1
  fi
}
assert_rewritten() { # assert_rewritten <tool> <file> <pristine>
  if cmp -s "$2" "$3"; then
    log_fail "$1 did not rewrite ${2#"$PROBE/pkg/"} — it now ignores too much"; FAILED=1
  else
    log_succ "$1 rewrote ${2#"$PROBE/pkg/"} (not ignored)"
  fi
}

write_probes
(cd "$PROBE/pkg" && "$PRETTIER_FIX" >/dev/null 2>&1 || true)
assert_unchanged prettier-fix "$PROBE/pkg/gen/bad.json" "$PRISTINE/bad.json"
assert_rewritten prettier-fix "$PROBE/pkg/src/bad.json" "$PRISTINE/bad.json"

write_probes
(cd "$PROBE/pkg" && "$MDLINT_FIX" >/dev/null 2>&1 || true)
assert_unchanged markdownlint-fix "$PROBE/pkg/gen/bad.md" "$PRISTINE/bad.md"
assert_rewritten markdownlint-fix "$PROBE/pkg/src/bad.md" "$PRISTINE/bad.md"

# --- A path with a SPACE: the ignore args must stay quoted. Unquoted, prettier exits
# 2 with "No files matching the pattern were found: ace/.gitignore" — i.e. the gate
# fails every push for that contributor, and the delegation stops applying.
SPACED="$WORKSPACE/with space/repo"
mkdir -p "$SPACED/pkg/gen" "$SPACED/pkg/src"
git -C "$SPACED" init --quiet
cp "$PROBE/.gitignore" "$SPACED/.gitignore"
# NOT a straight copy of $PROBE/package.json: prettier applies its `json-stringify`
# parser (forced multi-line) to any file literally NAMED package.json, unlike a
# generic .json file — $PROBE's single-line form is only ever fed to prettier as
# CONFIG DISCOVERY context (from inside pkg/, never checked directly by the old
# glob-mode fixture). This one IS checked directly below (git-delegated section),
# so it has to already be in prettier's canonical multi-line form.
printf '{\n  "name": "probe",\n  "private": true\n}\n' > "$SPACED/package.json"
cp "$PROBE/.prettierrc.json" "$SPACED/.prettierrc.json"
# Only the gitignored probes here: with the delegation intact both wrappers must exit
# CLEAN, which is what makes an unquoted-args failure unambiguous.
cp "$PRISTINE/bad.json" "$SPACED/pkg/gen/bad.json"
cp "$PRISTINE/bad.md" "$SPACED/pkg/gen/bad.md"
spaced_out="$(cd "$SPACED/pkg" && "$PRETTIER_CHECK" 2>&1)"
spaced_status=$?
assert_exits_clean "prettier-check (repo path with a space)" "$spaced_status" "$spaced_out"
spaced_md="$(cd "$SPACED/pkg" && "$MDLINT_CHECK" 2>&1)"
spaced_md_status=$?
assert_exits_clean "markdownlint-check (repo path with a space)" "$spaced_md_status" "$spaced_md"

# --- Same four guarantees, against the GIT-DELEGATED mechanism (story #414) ---
# The above exercises the wrappers in their zero-argument, glob + _ignore-*.sh mode
# (still live: `--filter <pkg> prettier:check`/`mdlint:check` calls them exactly this
# way). Root `format:check`/`format` no longer do — they go through run-format.sh,
# which derives the file list via git-tracked-paths.sh (`git ls-files`) instead.
# _ignore-*.sh and _reanchor-gitignore.awk were NOT deleted (#414's T-5 found the
# glob-mode path above still depends on them), so nothing here is left pointing at a
# removed helper — this section ADDS coverage for the new mechanism rather than
# replacing the assertions above. Exercised from the fixture's REPO ROOT (not pkg/):
# git-tracked-paths.sh's paths are repo-root-relative, matching how root package.json
# actually invokes run-format.sh.
write_probes
rf_prettier_out="$(cd "$PROBE" && "$RUN_FORMAT" check prettier json 2>&1)"
rf_prettier_status=$?
assert_violations_reported "run-format.sh (prettier check)" "$rf_prettier_status" "$rf_prettier_out"
if echo "$rf_prettier_out" | grep -q 'pkg/gen/bad.json'; then
  log_fail "run-format.sh (prettier check) reported a gitignored file (would block every push)"
  echo "$rf_prettier_out"; FAILED=1
else
  log_succ "run-format.sh (prettier check) ignores pkg/gen/bad.json (git-delegated)"
fi
if echo "$rf_prettier_out" | grep -qx 'pkg/src/bad.json'; then
  log_succ "run-format.sh (prettier check) still reports pkg/src/bad.json (not ignored)"
else
  log_fail "run-format.sh (prettier check) did not report pkg/src/bad.json — it now ignores too much"
  echo "$rf_prettier_out"; FAILED=1
fi

rf_mdlint_out="$(cd "$PROBE" && "$RUN_FORMAT" check markdownlint md 2>&1)"
rf_mdlint_status=$?
assert_violations_reported "run-format.sh (markdownlint check)" "$rf_mdlint_status" "$rf_mdlint_out"
if echo "$rf_mdlint_out" | grep -q 'pkg/gen/bad.md'; then
  log_fail "run-format.sh (markdownlint check) reported a gitignored file (would block every push)"
  echo "$rf_mdlint_out"; FAILED=1
else
  log_succ "run-format.sh (markdownlint check) ignores pkg/gen/bad.md (git-delegated)"
fi
if echo "$rf_mdlint_out" | grep -q 'pkg/src/bad.md.*MD009'; then
  log_succ "run-format.sh (markdownlint check) still reports pkg/src/bad.md (not ignored)"
else
  log_fail "run-format.sh (markdownlint check) did not report pkg/src/bad.md — it now ignores too much"
  echo "$rf_mdlint_out"; FAILED=1
fi

# FIX mode: same file set as check (AC4), through the git-delegated path too.
write_probes
(cd "$PROBE" && "$RUN_FORMAT" fix prettier json >/dev/null 2>&1 || true)
assert_unchanged "run-format.sh (prettier fix)" "$PROBE/pkg/gen/bad.json" "$PRISTINE/bad.json"
assert_rewritten "run-format.sh (prettier fix)" "$PROBE/pkg/src/bad.json" "$PRISTINE/bad.json"

write_probes
(cd "$PROBE" && "$RUN_FORMAT" fix markdownlint md >/dev/null 2>&1 || true)
assert_unchanged "run-format.sh (markdownlint fix)" "$PROBE/pkg/gen/bad.md" "$PRISTINE/bad.md"
assert_rewritten "run-format.sh (markdownlint fix)" "$PROBE/pkg/src/bad.md" "$PRISTINE/bad.md"

# Spaced path, through the git-delegated mechanism: needs at least one NON-ignored,
# CLEAN file, or the derived set is empty and run-format.sh exits 2 by design (T-1's
# "empty set is a broken wrapper, not zero violations" rule) — a different, deliberate
# guarantee from "exits clean", not a bug in this fixture.
printf '{ "a": 1 }\n' > "$SPACED/pkg/src/clean.json"
printf '# Title\n\nBody.\n' > "$SPACED/pkg/src/clean.md"
rf_spaced_out="$(cd "$SPACED" && "$RUN_FORMAT" check prettier json 2>&1)"
rf_spaced_status=$?
assert_exits_clean "run-format.sh check prettier (repo path with a space)" "$rf_spaced_status" "$rf_spaced_out"
rf_spaced_md_out="$(cd "$SPACED" && "$RUN_FORMAT" check markdownlint md 2>&1)"
rf_spaced_md_status=$?
assert_exits_clean "run-format.sh check markdownlint (repo path with a space)" "$rf_spaced_md_status" "$rf_spaced_md_out"

# --- _reanchor-gitignore.awk, table-driven: one fixture, three cwd positions ---
# Every branch of the translation is an OVER-ignore risk: get it wrong and files stop
# being checked silently (losing `!packages/dev-tools/src/release` would quietly stop
# checking tracked source). Pure text in / text out — no formatter, no git repo.
AWK_FIXTURE="$WORKSPACE/reanchor.gitignore"
cat > "$AWK_FIXTURE" <<'EOF'
# a comment

node_modules/
**/.cache/
apps/website/gen/
apps/*/dist/
apps/[!x]ebsite/build/
docs/performance/report.md
!packages/dev-tools/src/release
apps/website
EOF

assert_reanchor() { # assert_reanchor <label> <REL> <expected-file>
  local actual="$WORKSPACE/reanchor.actual"
  awk -v REL="$2" -f "$REANCHOR_AWK" "$AWK_FIXTURE" > "$actual" 2>&1
  if diff -u "$3" "$actual" > "$WORKSPACE/reanchor.diff" 2>&1; then
    log_succ "re-anchor (REL=$2): $1"
  else
    log_fail "re-anchor (REL=$2): $1 — output differs"
    cat "$WORKSPACE/reanchor.diff"; FAILED=1
  fi
}

# cwd is a package: anchored-inside-cwd re-anchored (also through a glob segment),
# patterns outside cwd dropped, `**/` and bare-name patterns verbatim, and the entry
# that IS cwd becomes `**`.
#
# `apps/[!x]ebsite/build/` pins the bracket-negation fixup: gitignore negates a class
# with `!`, ERE with `^`. Passed through unchanged, `[!x]ebsite` is a class matching a
# literal `!` or `x` — it does NOT match `website`, so the pattern gets DROPPED and
# `build/` is checked (the inverse of the intent, silently).
cat > "$WORKSPACE/expected-website" <<'EOF'
# a comment

node_modules/
**/.cache/
/gen/
/dist/
/build/
**
EOF
assert_reanchor 'anchored inside cwd + glob segment + ignored-dir-is-cwd' \
  'apps/website' "$WORKSPACE/expected-website"

# Negation survives re-anchoring, and everything under another top-level dir is dropped.
cat > "$WORKSPACE/expected-devtools" <<'EOF'
# a comment

node_modules/
**/.cache/
!/src/release
EOF
assert_reanchor 'negation preserved, unrelated anchors dropped' \
  'packages/dev-tools' "$WORKSPACE/expected-devtools"

# cwd sits INSIDE an ignored tree: everything here is ignored (`**`), twice over.
cat > "$WORKSPACE/expected-inside" <<'EOF'
# a comment

node_modules/
**/.cache/
**
**
EOF
assert_reanchor 'cwd inside the ignored tree' \
  'apps/website/gen/report' "$WORKSPACE/expected-inside"

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
