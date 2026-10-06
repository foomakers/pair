# Decision: registry targets are written by stage-and-rename, not by a lock; `add` registries are never staged

## Date

2026-10-06

## Status

Active

## Category

Technical Standard

## Context

Story #134: `pair install` / `pair update` wrote files into the project's target in place. An interrupted or concurrent run left a tree that was neither the old nor the new state; #421's mirror cleanup widened the window (delete, then re-copy).

## Decision

- One atomicity unit per registry target (not one global `.pair/` swap): the five registries have three ownership rules.
- Stage in a sibling `<target>.tmp-<pid>-<n>` (same filesystem: no EXDEV), SEEDED from the live target, then run the unchanged cleanup/copy pipeline against the stage. The ownership decision (`registryOwns`) stays where #421 put it; a rename-only swap of a fresh tree could not consult it.
- Swap: rename target aside (`<target>.bak.tmp-<pid>-<n>`) -> rename stage in -> delete aside. Aside restored if the stage cannot be moved in. One retry on a lost race.
- Recovery on the next run, by PID liveness (same predicate as the cache): dead stage removed; dead aside restored when the target is absent, removed otherwise.
- `behavior: add` (`.pair/adoption`) is never staged: skip-if-exists cannot half-replace, and adopter edits must not ride through a swap.
- File targets (`AGENTS.md`, `CLAUDE.md`, marker strip, copy-mode secondaries): temp sibling + rename onto the final path.
- Symlinks inside a seeded tree are recreated as symlinks (`FileSystemService.readlink`); symlinks pointing AT the canonical dir are path-based and survive the swap.
- Last-writer-wins, documented in the CLI docs. No lock, no lock-error.

## Alternatives Considered

- Lock file (`.pair/.install-lock`): stale-lock handling and a blocking failure nobody asked for; the cache already proved staging.
- Fresh stage from the source + rename over the target: deletes by rename, so it would remove non-owned paths (`.github/workflows`, `exclude`d paths).

## Consequences

- Target transiently duplicated on disk (`.pair/knowledge` is hundreds of KB).
- Windows: directory rename over an existing directory is not atomic; guarantees are POSIX.
- Open product question (not blocking): version skew between two concurrent runs is accepted and documented rather than detected.
