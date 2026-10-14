---
'@pair/pair-cli': minor
---

KB install, update and verification:

- **Breaking:** `pair-cli update` now deletes installed files the Knowledge Base no longer ships, so the target matches what the transform produces (#421). See the v0.4→v0.5 migration page.
- **Breaking:** exit codes are reliable. `kb-verify`, `kb-info` and `kb-cache` exit non-zero on failure. `install`/`update` exit 1 on a per-registry copy failure or a no-op (#447).
- `install --source`/`update --source` honour the source KB's own `pair.config.json` registry declaration, on a guarded allowlist (#447).
- Writes are atomic: each registry target is staged and swapped in by rename, so concurrent installs/updates never leave a half-written tree (#534).
- Cache slots are keyed by source identity, so installing an external KB no longer corrupts the official KB cache for other projects (#423).
- `kb-info` reports installed vs current KB version, including git sources, and points to the migration page on drift (#309, #444).
- `kb-validate` accepts optional link patterns (`link_validation.optional_link_patterns`, `--optional-link-patterns`): a missing target that matches is a warning, not an error (#445).
- Skills install flattened and prefixed, with `/command` references rewritten across runs. A skill's nested `references/` stays inside the skill (#269, #411).
- `.pair/working` (or the `working_path` override) is never a registry target, and a config that overlaps a reserved path is rejected (#308).
- `pair-cli package` quick mode uses the same defaults cascade as guided mode (#349).
- Fixes: `@pair/content-ops` ships as a runtime dependency, so KB commands no longer crash on a fresh npm install (#358). `update` is self-consistent on the dogfooded root install (#346). The download HEAD probe uses the injected HTTP client (#518).
