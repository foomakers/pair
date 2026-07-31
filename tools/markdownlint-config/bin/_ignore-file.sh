# shellcheck shell=sh
# The markdownlint ignore SOURCES, in ONE place — sourced by markdownlint-check.sh
# and markdownlint-fix.sh.
#
# Why shared: the ADL's invariant (2026-07-31-pre-push-gate-is-check-only.md) is
# that check and fix see the SAME file set, or the gate reports a file `pnpm format`
# refuses to touch. Copy-pasted assembly is precisely how that drifts, and nothing
# detects the drift (`dup:check` scans TypeScript only).
#
# Sources: the shared .markdownlintignore + the repo's own .gitignore files (repo
# root, and the package being linted), so "gitignored => never checked" holds without
# enumerating generated dirs. Matters since #394: in check mode a generated .md would
# BLOCK every push. markdownlint-cli accepts a SINGLE --ignore-path (unlike prettier),
# so the sources are concatenated into one temp file — it parses gitignore syntax, so
# the patterns carry over — with the ROOT file's patterns re-anchored to the cwd first
# (see _reanchor-gitignore.awk: markdownlint resolves patterns against the cwd, git
# against the ignore file's own directory).
#
# Requires: SCRIPT_DIR (the wrapper's bin/ directory).
# Effect: sets IGNORE_FILE, and registers the temp file's cleanup on EXIT.

IGNORE_FILE="$SCRIPT_DIR/../.markdownlintignore"

_ignore_git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$_ignore_git_root" ]; then
  _ignore_git_root="$(cd "$_ignore_git_root" && pwd -P)"
fi
_ignore_cwd="$(pwd -P)"

# Canonical paths on both sides: through a symlinked clone (or macOS /tmp ->
# /private/tmp) the raw strings differ while naming the same directory, which would
# concatenate the root file twice and leave this de-dup dead.
_ignore_root_file=""
if [ -n "$_ignore_git_root" ] && [ -f "$_ignore_git_root/.gitignore" ]; then
  _ignore_root_file="$_ignore_git_root/.gitignore"
fi
_ignore_local_file=""
if [ -f ".gitignore" ] && [ "$_ignore_cwd" != "$_ignore_git_root" ]; then
  _ignore_local_file=".gitignore"
fi

if [ -n "$_ignore_root_file" ] || [ -n "$_ignore_local_file" ]; then
  _ignore_combined="$(mktemp "${TMPDIR:-/tmp}/markdownlintignore.XXXXXX")"
  # shellcheck disable=SC2064 # expand now: the path must survive this file's scope
  trap "rm -f '$_ignore_combined'" EXIT
  {
    cat "$IGNORE_FILE"
    echo
    if [ -n "$_ignore_root_file" ]; then
      _ignore_rel="${_ignore_cwd#"$_ignore_git_root"/}"
      if [ "$_ignore_rel" = "$_ignore_cwd" ]; then
        # cwd IS the git root (or not under it): the patterns already resolve correctly.
        cat "$_ignore_root_file"
      else
        awk -v REL="$_ignore_rel" -f "$SCRIPT_DIR/_reanchor-gitignore.awk" "$_ignore_root_file"
      fi
      echo
    fi
    if [ -n "$_ignore_local_file" ]; then
      cat "$_ignore_local_file"
      echo
    fi
  } > "$_ignore_combined"
  IGNORE_FILE="$_ignore_combined"
fi
