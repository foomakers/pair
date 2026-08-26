# Decision: the CLI invocation name is `pair-cli`, not `pair`

## Date

2026-08-25

## Status

Active

## Category

Convention Adoption

## Context

Story #449 (refined in this session) found two linked defects: every documented invocation — `apps/pair-cli/src/commands/*/metadata.ts` `usage`/`examples` (all ten commands) and `apps/website/content/docs/reference/cli/{examples,workflows}.mdx` plus `DEVELOPMENT.md` — tells the reader to run `pair <command>`, but `apps/pair-cli/package.json` declares only `"bin": {"pair-cli": "dist/cli.js"}`; no `pair` bin, alias or wrapper exists anywhere in the repo. `apps/website/lib/docs-staleness-check.ts`'s `INVOCATION_PREFIX` matches only the literal `pair-cli` prefix, so it never sees the `pair <cmd>` docs and lets them drift silently.

The story's open question was which side is wrong: is `pair` the intended eventual public name (docs are right, the fix is to add a bin alias), or is `pair-cli` canonical (docs are wrong, the fix is a mechanical rename)? Two independent pieces of evidence already in the repo settle it before any new code is written:

1. `.pair/adoption/tech/infrastructure.md` already documents the manual release artifact's contract as `bin/pair-cli` + `bundle-cli/index.js` + docs (see ADL [2026-08-12-manual-cli-artifact-types-are-optional.md](2026-08-12-manual-cli-artifact-types-are-optional.md)) — the project has already committed to `pair-cli` as the shipped entry point.
2. `docs-staleness-check.ts`'s `INVOCATION_PREFIX` was itself built to recognize `pair-cli` — the gate's author already treated `pair-cli` as the correct name; it is blind to the bad docs only because nothing in the docs/metadata matches it, not because the gate targets the wrong name.

## Decision

**`pair-cli` is the canonical, and only, CLI invocation name.** No `pair` bin alias will be added.

All ten `apps/pair-cli/src/commands/*/metadata.ts` `usage`/`examples` strings, and every documented example in `apps/website/content/docs/reference/cli/{examples,workflows}.mdx` and `DEVELOPMENT.md`, are renamed from `pair <cmd>` to `pair-cli <cmd>` (mechanical, no behavior change). `apps/website/content/docs/customization/organization.mdx` was checked and, as of this refinement, carries no actual invocation lines — only prose mentions of "pair" as the product name — so it is out of scope, narrowing the story's original file list.

`docs-staleness-check.ts`'s `INVOCATION_PREFIX` is additionally widened to flag a bare `pair <cmd>` invocation (no `-cli`) as an error in its own right, not merely to validate `pair-cli`-prefixed commands against the registry — otherwise a future regression back to the wrong name would not be caught by the gate that exists for exactly this class of defect.

## Alternatives Considered

- **Add a `pair` bin alias, keep the docs as-is**: rejected. Nothing in the repo treats `pair` as a real entry point today (no bin, no wrapper, no marketplace/plugin path exposing one); adopting it now would mean maintaining two invocation names for the same tool with no distinguishing purpose between them.
- **Do nothing (leave the ambiguity for the eventual implementer)**: rejected — refinement's job is to remove exactly this kind of open question before the story reaches `Ready`, and the evidence to settle it was already sitting in `infrastructure.md`.

## Consequences

- The mechanical rename ripples through 10 `metadata.ts` files, 2 docs pages, and `DEVELOPMENT.md`; `apps/pair-cli/package.json`'s `bin` field is unchanged (already correct).
- `docs-staleness-check.ts` and its test gain a new failure mode (bare `pair` invocation), closing the gap that let this drift happen unseen.
- If a future decision ever wants a shorter public alias, it must explicitly reopen this ADL rather than silently reintroducing `pair` in docs.

## Adoption Impact

- `.pair/adoption/tech/infrastructure.md` — already states the `bin/pair-cli` contract; adds one cross-reference line to this ADL so the CLI-invocation-naming fact and the release-artifact-contract fact are linked for a future reader.
- No change to `tech-stack.md` or `way-of-working.md`.
