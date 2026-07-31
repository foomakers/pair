# shellcheck shell=sh
# The prettier ignore SOURCES, in ONE place — sourced by prettier-check.sh and
# prettier-fix.sh.
#
# Why shared: the ADL's invariant (2026-07-31-pre-push-gate-is-check-only.md) is
# that check and fix see the SAME file set, or the gate reports a file `pnpm format`
# refuses to touch. Copy-pasted assembly is precisely how that drifts, and nothing
# detects the drift (`dup:check` scans TypeScript only).
#
# Sources: the shared .prettierignore + the repo's own .gitignore files (repo root,
# and the package being checked), so "gitignored => never formatted/checked" holds
# without enumerating generated dirs. Since #394 the gate runs prettier in CHECK
# mode, where a generated artifact would BLOCK every push instead of being silently
# rewritten. prettier 3.6 accepts --ignore-path repeatedly, and resolves each file's
# patterns against THAT FILE's directory — git semantics — so no re-anchoring is
# needed here (markdownlint differs; see its _ignore-file.sh).
#
# Requires: SCRIPT_DIR (the wrapper's bin/ directory).
# Effect: APPENDS its --ignore-path arguments to the caller's positional parameters,
# so each value stays quoted (assembling them into a string word-split on a repo
# path containing a space, and prettier then failed every push with "No files
# matching the pattern were found") while the caller's own path arguments survive.

set -- "$@" --ignore-path "$SCRIPT_DIR/../.prettierignore"

_ignore_git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$_ignore_git_root" ]; then
  _ignore_git_root="$(cd "$_ignore_git_root" && pwd -P)"
fi

if [ -n "$_ignore_git_root" ] && [ -f "$_ignore_git_root/.gitignore" ]; then
  set -- "$@" --ignore-path "$_ignore_git_root/.gitignore"
fi

# The package-local .gitignore, when the cwd is not the repo root. Compared on
# CANONICAL paths: through a symlinked clone (or macOS /tmp -> /private/tmp) the
# raw strings differ while naming the same directory, which would add the root file
# twice and leave the de-dup dead.
if [ -f ".gitignore" ] && [ "$(pwd -P)" != "$_ignore_git_root" ]; then
  set -- "$@" --ignore-path ".gitignore"
fi
