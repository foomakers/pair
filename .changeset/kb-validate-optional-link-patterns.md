---
'@pair/pair-cli': minor
---

`pair kb-validate`: declare relative markdown links that point outside the KB tree as
**optional**, instead of switching whole registries off to validate a KB in isolation.

- New `--optional-link-patterns "<globs>"` flag (comma-separated) and new top-level
  `link_validation.optional_link_patterns` key in `pair.config.json` / `config.json`.
  The two are **merged** (union of the trimmed entries, deduplicated), never replaced.
- A **missing** target matching a pattern is reported as
  `optional link (pattern-matched), target missing: …` — a warning that does not fail the
  run. A target that exists is simply valid; a missing target matching nothing stays an error.
- `--strict` overrides optional patterns: in strict mode every missing target is an error.
- Links carrying a non-http URI scheme (`mailto:`, `tel:`, `ftp:`, `vscode:`) are skipped:
  they are not filesystem paths, and were previously resolved as one and reported as broken
  internal links.
- Patterns always match against the target resolved relative to the KB root (`apps/x.ts`) —
  the form to write them in, since it does not vary with the depth of the file the link is
  written in — and additionally against the link as written (`../../apps/x.ts`) only where that written
  form is a spelling of the same resolved target — its `../` climb lands on the KB root — or
  where the target leaves the KB tree. A link resolving back INSIDE the KB is matched on its
  resolved form only, so a broken in-KB link is still an error. Glob syntax: `**`, `*`, `?`,
  `[abc]`, anchored to the whole path — and anchored on the KB ROOT, so a leading `/` or `./`,
  a trailing `/` and repeated `/` are stripped from pattern and path alike (`/apps/**`, the way
  an absolute internal link is written, is the same rule as `apps/**`). A malformed pattern is
  warned about and skipped, never fatal.

Fully backward compatible: with no patterns declared, every missing internal link is an
error exactly as before.

Also in this release:

- A markdown link's destination is now parsed per CommonMark: a titled link
  (`` [x](./b.md "Title") ``) or a `<…>`-wrapped destination no longer has the title or the
  angle brackets captured as part of the target. Previously `kb-validate` reported such a
  link as broken even when its real target existed — an existing KB may see fewer errors
  after upgrading.
- Every CLI command's console output now escapes C0/C1 control characters (`\xNN`), keeping
  `\t`/`\n` as real formatting. Closes the gap where a value read from a config file or a
  third-party KB could move the cursor, clear the screen, or forge a line of output.
- `kb-validate`'s report gains a `Configuration:` section for run-level diagnostics (a
  malformed pattern, a bad config shape); these are now counted in the report's `Warnings:`
  total instead of only being logged.
- `--ignore-config` now prints a notice explaining that no config is read and link
  validation does not run, instead of running silently.
