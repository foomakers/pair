#!/usr/bin/env bash
# OFFLINE_SAFE=true
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
#      the cwd (git resolves them against the ignore file's directory).
#
# Per the gate-tooling ADL (2026-07-13) this shell surface is verified with a smoke
# test, not a vitest unit test.
source "$(dirname "$0")/../lib/utils.sh"
ensure_tmp_dir

TEST_NAME="Formatter Ignore Delegation (.gitignore)"
echo "=== Running $TEST_NAME ==="

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
PRETTIER_CHECK="$REPO_ROOT/tools/prettier-config/bin/prettier-check.sh"
PRETTIER_FIX="$REPO_ROOT/tools/prettier-config/bin/prettier-fix.sh"
MDLINT_CHECK="$REPO_ROOT/tools/markdownlint-config/bin/markdownlint-check.sh"
MDLINT_FIX="$REPO_ROOT/tools/markdownlint-config/bin/markdownlint-fix.sh"

FAILED=0
for f in "$PRETTIER_CHECK" "$PRETTIER_FIX" "$MDLINT_CHECK" "$MDLINT_FIX"; do
  assert_file "$f" || exit 1
done

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
prettier_out="$(cd "$PROBE/pkg" && "$PRETTIER_CHECK" 2>&1 || true)"
if echo "$prettier_out" | grep -q 'gen/bad.json'; then
  log_fail "prettier-check reported a gitignored file (would block every push)"
  echo "$prettier_out"; FAILED=1
else
  log_succ "prettier-check ignores gen/bad.json (gitignored)"
fi
if echo "$prettier_out" | grep -q 'src/bad.json'; then
  log_succ "prettier-check still reports src/bad.json (not ignored)"
else
  log_fail "prettier-check did not report src/bad.json — it now ignores too much"
  echo "$prettier_out"; FAILED=1
fi

mdlint_out="$(cd "$PROBE/pkg" && "$MDLINT_CHECK" 2>&1 || true)"
if echo "$mdlint_out" | grep -q 'gen/bad.md'; then
  log_fail "markdownlint-check reported a gitignored file (would block every push)"
  echo "$mdlint_out"; FAILED=1
else
  log_succ "markdownlint-check ignores gen/bad.md (root pattern re-anchored to the cwd)"
fi
if echo "$mdlint_out" | grep -q 'src/bad.md'; then
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
# Only the gitignored probes here: with the delegation intact both wrappers must exit
# CLEAN, which is what makes an unquoted-args failure unambiguous.
cp "$PRISTINE/bad.json" "$SPACED/pkg/gen/bad.json"
cp "$PRISTINE/bad.md" "$SPACED/pkg/gen/bad.md"
spaced_out="$(cd "$SPACED/pkg" && "$PRETTIER_CHECK" 2>&1)"
spaced_status=$?
if [ "$spaced_status" -eq 0 ] && ! echo "$spaced_out" | grep -q 'No files matching'; then
  log_succ "prettier-check survives a repo path containing a space"
else
  log_fail "prettier-check broke on a path with a space (status $spaced_status)"
  echo "$spaced_out"; FAILED=1
fi
spaced_md="$(cd "$SPACED/pkg" && "$MDLINT_CHECK" 2>&1)"
spaced_md_status=$?
if [ "$spaced_md_status" -eq 0 ]; then
  log_succ "markdownlint-check survives a repo path containing a space"
else
  log_fail "markdownlint-check broke on a path with a space (status $spaced_md_status)"
  echo "$spaced_md"; FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  log_fail "$TEST_NAME had failures"; exit 1
fi
log_succ "$TEST_NAME passed"
