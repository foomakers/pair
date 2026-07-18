# ADR-014: Tool-family packages fold when they share a bounded context — package boundaries track bounded contexts, not folder-level tool groupings

## Status

Accepted

## Date

2026-07-16

## Context

- Story #148 (PR #333, branch `chore/148-release-tools-org`) originally ported the release pipeline's version-resolution logic (`determine-version`, previously a bash script at `scripts/workflows/release/determine-version.sh`) into a new standalone package, `@pair/release-tools`, mirroring the existing `@pair/dev-tools` pattern (gate/tooling logic as tested TypeScript modules — see ADL [2026-07-13-gate-tooling-code-in-tested-modules.md](../../decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md)).
- `@pair/dev-tools` itself holds three quality-gate tools (`code-hygiene-check`, `sync-version-in-docs`, `benchmark-update-link` — the last landed via PR #334/#209, migrating `scripts/perf/benchmark-update-link.js`). All four tools across the two packages share the same shape: an importable, unit-tested module plus a thin CLI wrapper (`main()` behind a `require.main === module` guard), invoked exclusively via `pnpm --filter <pkg> <script>`.
- None of these tools is ever `import`ed by any app or package as a workspace dependency — each is a script entrypoint only (build-time/CI/local-dev tooling), never a runtime library dependency of the monorepo.
- A bounded-context analysis (mapping subdomains to DDD bounded contexts, per [map-subdomains-contexts-process-to-capability](adr-012-map-subdomains-contexts-process-to-capability.md)'s established process) placed both tool families — dev/CI quality gates and release-pipeline decision logic — in the **same** bounded context: [Integration & Process Standardization](../boundedcontext/integration-process-standardization.md), whose scope explicitly covers "automation scripts and operational standards for development and deployment."
- The owner flagged the resulting two-package split (`@pair/dev-tools` + `@pair/release-tools`) as wrong once this was visible: a package boundary in this monorepo should track a bounded context, not an arbitrary folder-level grouping of tools. Splitting one bounded context's automation scripts across two packages — differentiated only by "gate tooling" vs. "release tooling," a distinction with no consumer, no independent versioning need, and no distinct workspace-dependency surface — is unwarranted ceremony.
- This is a genuine reversal in-flight: PR #333 had already been reviewed and approved three times against the two-package structure before this decision landed.

## Options Considered

### Option 1: Keep `@pair/release-tools` as a separate package (status quo going into this decision)

- **Description**: `determine-version` stays in its own package, alongside `@pair/dev-tools`'s three quality-gate tools in a sibling package.
- **Pros**: Mirrors the existing `@pair/dev-tools` module/CLI-wrapper shape exactly, no new folder structure to introduce; the two packages could in principle version/publish independently.
- **Cons**: Two packages for one bounded context, with no consumer ever importing either as a workspace dependency — independent versioning has no forcing function. Reviewers and future contributors must learn "which of two nearly-identical tooling packages does my script belong in," a distinction that tracks no real boundary. Sets a precedent that every new tool family gets its own package, fragmenting a single bounded context indefinitely.

### Option 2: Fold `@pair/release-tools` into `@pair/dev-tools`, reorganized into folders by tool family (`src/quality-gates/`, `src/release/`)

- **Description**: Delete `packages/release-tools/`; move `determine-version` (with its test) into `packages/dev-tools/src/release/`; move the three existing quality-gate tools into `packages/dev-tools/src/quality-gates/`. One package, two folders, four tools.
- **Pros**: Package boundary now tracks the actual bounded context (Integration & Process Standardization) rather than a tool-family label. One `package.json`, one `tsconfig.json`, one `vitest.config.ts`, one lockfile workspace entry to maintain. Folder-level organization (`quality-gates/` vs. `release/`) still gives each tool family a clear home without the ceremony of a full package (own manifest, own dependency set, own CI wiring) for a boundary that isn't real. Consistent precedent for any future tool added to this bounded context: it's a new folder, not automatically a new package.
- **Cons**: A folder move touches every affected file's relative paths and `__dirname`-derived path constants (`REPO_ROOT`, self-exclude paths) — a mechanical but review-sensitive migration (see the process lesson below). Slightly less separable if this bounded context's tooling ever needs genuinely independent publishing (assessed as unlikely: none of these tools is published or imported today).

## Decision

**Option 2.** `@pair/release-tools` is folded into `@pair/dev-tools`, reorganized into `src/quality-gates/` (code-hygiene-check, sync-version-in-docs, benchmark-update-link) and `src/release/` (determine-version). The general rule this decision establishes: **a package boundary in this monorepo tracks a bounded context; a tool-family distinction within one bounded context is expressed as a folder, not a package** — unless and until a concrete forcing function (real independent versioning/publishing need, or a distinct workspace-dependency consumer) argues otherwise for a specific tool family.

## Consequences

### Benefits

- One package (`@pair/dev-tools`) now correctly represents the one bounded context (Integration & Process Standardization) it implements; the package/context correspondence recorded in [map-subdomains-contexts-process-to-capability](adr-012-map-subdomains-contexts-process-to-capability.md)'s process holds precisely.
- Single `package.json`/`tsconfig.json`/`vitest.config.ts`/lockfile workspace entry for all four tools — less maintenance surface, one place to look for "what automation tooling exists."
- Establishes a reusable litmus test for future tool additions to this repo: does the new tool share a bounded context with an existing tooling package? If yes, it's a new folder there, not a new package — avoiding indefinite package fragmentation.
- `determine-version`'s full ported logic and all three prior code-review rounds' fixes (`requireValue`, `-h`/`--help` short-circuit, the no-leading-v `--input-version` test, etc.) carried over unchanged — this is a structural move, not a logic rewrite.

### Trade-offs and Limitations

- The folder move required updating every `__dirname`-relative path constant (`REPO_ROOT` resolution depth, `code-hygiene-check.ts`'s self-exclude path) in the three relocated quality-gate files — a mechanical migration that is easy to under-verify. Process lesson recorded from this rollout: **after `git mv`, any further edit to the destination file must be explicitly re-`git add`ed before committing** — `git mv` stages the rename immediately, and post-move edits to that file are not automatically included in the next commit. Verify with `git diff --cached`, not just `git status`, before committing a rename+edit. (This exact gap shipped once in this PR's history and was caught by review before merge.)
- If a tool family in this bounded context later needs genuinely independent versioning or publishing, it would need to be re-split into its own package at that point — this decision does not foreclose that, it just requires a concrete forcing function to justify it, rather than doing it preemptively per tool family.

## Adoption Impact

- [architecture.md](../architecture.md): add a "Tooling Package Boundaries" note under a new subsection, stating the rule (package boundary tracks bounded context; tool-family distinctions within one context are folders, not packages) and pointing to this ADR.
- [way-of-working.md](../way-of-working.md): the existing "Gate & tooling code" bullet under Quality Gates gains a follow-on sentence noting that gate/tooling packages are organized by bounded context (this ADR), not one package per tool family — kept next to the ADL it already references since the two decisions compose (module-vs-script shape, then package-vs-folder boundary).
- No context-map change: this decision is architectural (package/workspace structure), not a change to the bounded-context mapping itself — `Integration & Process Standardization` in [integration-process-standardization.md](../boundedcontext/integration-process-standardization.md) already covered both tool families; this ADR is the codebase catching up to that mapping, not revising it.
