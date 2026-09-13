# Decision: the scope-decision principal is read from adoption — never a login literal in shipped code

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

`cycle-state.mjs apply-scope-decisions` authenticates the maintainer's decision by reading the real
PR comment through `gh` and checking `user.type == User` and `user.login == <maintainer>`. The
maintainer defaulted to the literal `'rucka'` inside a script shipped to every adopter (10 copies),
and nothing in the repository passed `--maintainer` (T-9 fourth round, t9d-17). For an adopter that
meant a comment by the GitHub account `rucka` could rewrite their card or open an issue in their
repository, while their own maintainer was `author-not-authorized`. `batch-engine.mdx` already
claimed the author is verified against "the adopted maintainer set".

## Decision

1. **The principal is resolved from adoption at run time.** `resolveMaintainer` walks up from the
   run directory to `.pair/adoption/tech/way-of-working.md` and reads the `## Assignment` cascade
   the item writer and publish-pr already use: `code-host-assignee` (the PR side) first, else
   `default-assignee`.
2. **`--maintainer <login>` stays the explicit override** (source `flag`) — for a host that
   resolved the principal itself, and for tests.
3. **Fail closed.** No adoption file, or no assignee key, is the typed refusal
   `maintainer-unresolved:<why>` — before any PR read, with nothing written. The success result
   reports `maintainer: { login, source }` so the record says who was authorized and why.

## Alternatives Considered

- **Require `--maintainer` always**: rejected — the review-phase skill runs the command from a
  documented line; a value it must invent is a value it may get wrong, and adoption already
  declares the maintainer once.
- **A maintainer SET (several logins)**: not needed by any adopter today; the cascade resolves
  one identifier, and a set would be a way-of-working schema change for the item writer too.

## Consequences

- Adopters need `default-assignee` (or `code-host-assignee`) declared under `## Assignment`; the
  same requirement `/pair-capability-write-issue` warns about, now enforced by refusal here.
- Tests seed a way-of-working fixture under every run-directory root; a source scan asserts no
  hard-coded principal remains.

## References

- `.claude/skills/pair-workflow-*/scripts/cycle-state.mjs` (`resolveMaintainer`, `findAdoptionFile`)
- `.pair/adoption/tech/way-of-working.md` § Assignment; `apps/website/content/docs/reference/batch-engine.mdx`
