# Re-anchor the patterns of the REPO-ROOT .gitignore for markdownlint-cli.
#
# markdownlint-cli resolves --ignore-path patterns against the CURRENT WORKING
# DIRECTORY; git resolves them against the directory of the .gitignore FILE. So the
# ADL invariant "gitignored => never checked" (2026-07-31-pre-push-gate-is-check-only)
# would hold only for non-anchored patterns: with cwd=apps/website, the root entry
# `apps/website/gen/` matches nothing under cwd, a generated `gen/report.md` gets
# CHECKED, and in check mode it blocks every push from that package — the exact
# failure this mechanism exists to prevent. It happens to work today only because
# the current root entries are `**/`-style.
#
# prettier needs no equivalent: it resolves each --ignore-path against that file's
# own directory, i.e. git semantics already.
#
# Usage: awk -v REL="<cwd relative to the git root>" -f this <root .gitignore>
#
# Per pattern (gitignore(5)):
#   blank / comment                      -> verbatim
#   no `/` except a trailing one, or `**/`-> matches at any depth      -> verbatim
#   anchored, inside cwd                 -> prefix stripped, re-anchored `/rest`
#   anchored, and cwd is inside it       -> `**` (everything here is ignored)
#   anchored, elsewhere                  -> dropped (cannot match anything under cwd)
# Order is preserved: gitignore is last-match-wins.
#
# Known approximations (no root .gitignore entry in this repo uses either form, and both
# would fail as an over- or under-ignore inside ONE path segment, never as an error):
#   - a mid-pattern `**` (`apps/**/gen/`) consumes exactly one path segment here, so it is
#     dropped rather than re-anchored when cwd is deeper. `**/`-prefixed patterns — the
#     common form — are exact.
#   - bracket expressions are passed through to ERE verbatim except for the leading-`!`
#     negation (`[!abc]` -> `[^abc]`). A class whose FIRST character is a literal `]`
#     (`[]abc]`, legal in a POSIX class) therefore breaks; ranges and plain sets are fine.

# Does one glob path segment match one literal path segment?
function seg_match(pat, s,   re, i, ch) {
  if (pat == s) return 1
  if (pat !~ /[*?[]/) return 0
  re = "^"
  for (i = 1; i <= length(pat); i++) {
    ch = substr(pat, i, 1)
    if (ch == "*") re = re "[^/]*"
    else if (ch == "?") re = re "[^/]"
    else if (ch == "[") {
      # Bracket expressions are passed through, with ONE fixup: gitignore negates a
      # class with `!`, ERE with `^`. Unfixed, `[!abc]` would become a class matching a
      # literal `!`, a, b, c — the exact INVERSE of the intended set.
      re = re "["
      if (substr(pat, i + 1, 1) == "!") { re = re "^"; i++ }
    }
    else if (ch == "]") re = re ch
    else if (index(".+(){}|^$\\/", ch) > 0) re = re "\\" ch
    else re = re ch
  }
  return (s ~ (re "$"))
}

BEGIN { nrel = split(REL, rel, "/") }

{
  line = $0
  if (line ~ /^[[:space:]]*$/ || line ~ /^#/) { print line; next }

  neg = ""
  p = line
  if (substr(p, 1, 1) == "!") { neg = "!"; p = substr(p, 2) }
  if (p ~ /^\*\*\//) { print line; next }

  lead = (substr(p, 1, 1) == "/")
  if (lead) p = substr(p, 2)
  trailing = (p ~ /\/$/) ? "/" : ""
  body = p
  sub(/\/+$/, "", body)
  if (!lead && index(body, "/") == 0) { print line; next }

  n = split(body, seg, "/")
  i = 1
  for (j = 1; j <= nrel; j++) {
    if (i > n) { print neg "**"; next }          # cwd sits inside the ignored tree
    if (!seg_match(seg[i], rel[j])) next         # the pattern is outside cwd
    i++
  }
  if (i > n) { print neg "**"; next }            # the ignored directory IS cwd

  rest = seg[i]
  for (k = i + 1; k <= n; k++) rest = rest "/" seg[k]
  print neg "/" rest trailing
}
