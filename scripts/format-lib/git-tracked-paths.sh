# shellcheck shell=sh
#
# scripts/format-lib/git-tracked-paths.sh (story #414)
#
# Shared, git-delegated path derivation, sourced by BOTH formatter wrapper
# packages (tools/prettier-config/bin/, tools/markdownlint-config/bin/), for
# both check and fix. One derivation, two modes — a divergence between check
# and fix must be impossible by construction, not by discipline (ADL
# 2026-07-31-pre-push-gate-is-check-only.md).
#
# git_tracked_paths <ext> [<ext> ...]
#   Writes NUL-delimited paths to stdout: every path git tracks (--cached) or
#   sees as untracked-but-not-ignored (--others --exclude-standard) whose
#   filename ends in ".<ext>" for one of the given extensions. "gitignored =>
#   never checked" is delegated to git itself — nested .gitignore files,
#   .git/info/exclude and the user's global core.excludesFile all apply by
#   construction, with no re-implementation here.
#
# One documented exception: a file under a THIRD-PARTY skill directory
# (.claude/skills/<name>/** where <name> does not start with "pair-") is never
# emitted. Their formatting is not this project's to maintain, and every
# marketplace reinstall would otherwise reintroduce the violation and block
# the push (AC9, story #414). `.claude/skills/pair-*/**` (mirrors of this
# repo's own KB dataset) stay covered like anything else.
#
# Exit codes:
#   0 — at least one path found, written to stdout
#   2 — git is unavailable / this is not a git work tree, OR the derived set
#       is empty for any other reason. An empty set is never a silent pass:
#       delegating to git introduces exactly one new failure mode — a missing
#       git reads as "zero files, check clean" — so this treats ANY empty
#       result as a broken wrapper, matching what the wrappers already do for
#       a failed `mktemp`.
git_tracked_paths() {
  _gtp_exts="$*"

  _gtp_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "git-tracked-paths: git is unavailable, or this is not a git work tree" >&2
    return 2
  }

  _gtp_out="$(mktemp "${TMPDIR:-/tmp}/git-tracked-paths.XXXXXX")" || {
    echo "git-tracked-paths: cannot create a temporary file" >&2
    return 2
  }

  git -C "$_gtp_root" ls-files -z --cached --others --exclude-standard |
    tr '\0' '\n' |
    {
      while IFS= read -r _gtp_path; do
        case "$_gtp_path" in
          .claude/skills/*)
            _gtp_skill="${_gtp_path#.claude/skills/}"
            _gtp_skill="${_gtp_skill%%/*}"
            case "$_gtp_skill" in
              pair-*) ;;
              *) continue ;;
            esac
            ;;
        esac
        for _gtp_ext in $_gtp_exts; do
          case "$_gtp_path" in
            *".$_gtp_ext")
              printf '%s\0' "$_gtp_path"
              break
              ;;
          esac
        done
      done
    } >"$_gtp_out"

  if [ ! -s "$_gtp_out" ]; then
    echo "git-tracked-paths: derived path set is empty — treating as a broken wrapper, not zero violations" >&2
    rm -f "$_gtp_out"
    return 2
  fi

  cat "$_gtp_out"
  rm -f "$_gtp_out"
}
