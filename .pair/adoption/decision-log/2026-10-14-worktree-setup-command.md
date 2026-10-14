# Decision: Fresh Worktrees Run `worktree-setup-command` Before Any Gate

## Date

2026-10-14

## Status

Active

## Category

Process Decision

## Context

Driving #543 (PR #544), the reviewer's detached review worktree had no `node_modules` and no `dist`. It symlinked another checkout's instead and got spurious gate failures (`tsc` could not resolve `@pair/content-ops`, `package-manual.sh` failed). The implementer and the reviewer did not run the full gates either. No setup command was declared anywhere, so each stage improvised.

## Decision

- New `way-of-working.md` key `worktree-setup-command`. Value here: `pnpm install --frozen-lockfile && pnpm build`.
- Consumers: `/pair-workflow-implement-phase` (story worktree, Step 3.2) and `/pair-workflow-review-phase` (detached review worktree, Step 1). Each runs the command once in a fresh worktree, before any gate.
- Never symlink another checkout's `node_modules`/`dist`.
- The review records the gates it actually ran, with their exit codes. A gate that was not run is never reported green.
- Key absent ⇒ nothing is run (the zero-configuration default for adopters).

## Alternatives Considered

- **Hard-code `pnpm install && pnpm build` in the skills**: rejected, because the KB ships to adopters with other toolchains.
- **Symlink the main checkout's `node_modules`/`dist`**: rejected. It mixes in another checkout's build state and caused the #543 failures.
- **A script that creates and provisions the review worktree**: rejected for now as more code than needed. The skill creates the worktree in one line.

## Consequences

A fresh worktree pays one install and build, which the frozen lockfile and turbo cache keep fast. Gate results reflect the head under review, not borrowed artifacts.

## Adoption Impact

- `adoption/tech/way-of-working.md`: the `worktree-setup-command` bullet (value, rationale, no symlinking).
