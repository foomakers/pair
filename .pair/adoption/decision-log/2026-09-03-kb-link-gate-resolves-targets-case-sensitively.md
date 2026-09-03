# Decision: the KB link gate resolves link targets case-sensitively (GitHub parity)

## Date

2026-09-03

## Status

Active

## Category

Tooling Preference

## Context

`pnpm --filter @pair/knowledge-hub check:links` (`check-broken-links.ts` → `validatePathOps`
in `@pair/content-ops`) decided whether a KB-internal relative link resolves with
`fileSystemService.exists`, which is `fs.stat`. `fs.stat` inherits the volume's case rule:
APFS (the macOS default) finds `docs/guide.md` when only `Docs/Guide.md` is on disk; ext4 on
Linux CI and github.com both say ENOENT / 404 for the same path. A miscased link therefore
printed `All markdown links are valid.` on a developer's Mac and 404'd for every reader on
GitHub — the same local-PASS / CI-FAIL asymmetry the docs-site staleness check had already
removed for repo-file citations (`existsCaseSensitive` in `apps/website/lib/docs-staleness-check.ts`,
Check 5b, PR #471). Surfaced as a review question on PR #471: widen the PR to the KB gate or
accept the asymmetry as out of the story's changed surface.

Boundary proof (2026-09-03): `curl` on `blob/main/.pair/knowledge/guidelines/README.md` → 200,
`blob/main/.pair/Knowledge/guidelines/README.md` → 404 (same for `raw.githubusercontent.com`);
a scratch dataset with `docs/Guide.md` linked as `./docs/guide.md` passed the pre-change
`check:links` (exit 0) on APFS and is reported `LINK TARGET NOT FOUND` after it (exit 1).

## Decision

Every existence decision in the content-ops link chain compares each path segment
byte-for-byte against its parent directory's listing — `existsCaseSensitive(fileService, path)`
in `packages/content-ops/src/file-system/exists-case-sensitive.ts` — instead of `fs.stat`:

- `replacement-generator.ts` `processLinkExistence` (the `LINK TARGET NOT FOUND` verdict),
- `path-resolution.ts` `tryResolvePathVariants` (the candidate written back as the fix),
- `link-processor.ts` normalization (only rewrites links whose target exists).

The answer is the one github.com gives on every OS, so the gate cannot pass locally and fail
in CI on the case axis. The helper is built on the `FileSystemService` interface's existing
`readdir` + `exists`, so no interface change and every in-memory double keeps working.

## Alternatives Considered

- **Make `fileSystemService.exists` itself case-sensitive**: changes semantics for every
  consumer (install, backup, root detection, skill manifests) and adds a `readdir` walk to
  hot paths that never cared about case; the asymmetry is a link-gate problem, fixed where
  links are judged.
- **Add `existsCaseSensitive` to the `FileSystemService` interface**: forces every
  hand-rolled `Partial<FileSystemService>` double in the repo to grow a method for a
  predicate that is derivable from `readdir`; a free function over the interface is the
  smaller contract.
- **Accept as out of scope (the review's other option)**: leaves the gate lying on macOS on
  exactly the 404 class it exists to catch, in the same PR that closed it for the docs site.

## Consequences

- `check:links` now reports a miscased KB link on macOS exactly as CI and GitHub do; both real
  roots (`dataset/`, `.pair/knowledge`) are still green.
- Cost: one `readdir` per path segment per link — `pnpm check:links` on the full KB went from
  ~5.9s to ~10.3s wall-clock on the developer machine (no caching added; revisit only if the gate
  becomes the slow step).
- The in-memory `FileSystemService` double's `readdir('/')` used to list root entries as
  `/dir` instead of `dir` (a `replace('//', '')` artefact); fixed to `basename`, matching
  `fs.readdir`, so the walk works on the double too.
- An adopter whose KB carries miscased relative links sees them fail `check:links` on macOS
  from this version on — they were already broken on GitHub and on Linux CI.

## Adoption Impact

- `adoption/tech/way-of-working.md` § Quality Gates — one bullet stating that the two link
  gates (`check:links`, docs `docs:staleness` Check 5b) resolve targets case-sensitively, and why.
