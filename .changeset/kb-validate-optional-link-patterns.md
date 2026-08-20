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
- Patterns always match against the target resolved relative to the KB root (`apps/x.ts`),
  and additionally against the link as written (`../../apps/x.ts`) only where that written
  form is a spelling of the same resolved target — its `../` climb lands on the KB root — or
  where the target leaves the KB tree. A link resolving back INSIDE the KB is matched on its
  resolved form only, so a broken in-KB link is still an error. Glob syntax: `**`, `*`, `?`,
  `[abc]`, anchored to the whole path. A malformed pattern is warned about and skipped, never
  fatal.

Fully backward compatible: with no patterns declared, every missing internal link is an
error exactly as before.
