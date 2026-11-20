# Decision: Repository-scoped cycle worktree root

## Date

2026-11-17

## Status

Active

## Category

Convention Adoption

## Context

Sibling repositories using `../pair-worktrees/<card>` target the same path for equal card IDs. A linked checkout must resolve the same root as its main checkout.

## Decision

The default cycle root is `../pair-worktrees/<main-checkout-name>`, anchored to the canonical Git common directory's main checkout. A top-level `pair.config.json.worktreeRoot` or explicit `--worktree-root` replaces that root directly. Relative roots resolve from the main checkout; absolute roots retain spaces. Git common directory identity determines ownership. A foreign or occupied destination is a manual `worktree-conflict` decision stop.

## Alternatives Considered

- **Remote URL namespace**: separate clones can share an origin and still own distinct worktrees.
- **Automatic legacy migration**: existing worktrees may contain uncommitted work, so moving or deleting them is unsafe.

## Consequences

Legacy trees remain where they are; set the previous root explicitly to reuse them. The CLI, packet renderer and batch engine must use one effective root for creation, hooks, recovery, review and cleanup.

## Adoption Impact

`.pair/adoption/tech/way-of-working.md` records the root convention and manual conflict resolution.
