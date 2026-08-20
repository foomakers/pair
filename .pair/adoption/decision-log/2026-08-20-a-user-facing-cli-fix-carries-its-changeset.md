# Decision: a user-facing `pair-cli` fix carries its changeset, even while releases are batched

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

Story #216 fixes `llms-generation.ts` so the generated `.pair/llms.txt` indexes `.pair/adoption/{product,tech}/` instead of the never-shipped `.pair/{product,tech}/adopted/`. `@pair/pair-cli` is published (`"private": false`), so the entire value of that fix is for adopters running `pair install` / `pair update`.

`dd1ff524` ("chore: drop the pending changeset — no release now") deleted the only pending changeset because any file under `.changeset/` keeps the changesets bot's release PR open and regenerating CHANGELOGs. Read as a standing policy, it would mean no changeset is ever added; read as written ("not releasing **yet**", "restore this file **when a release is wanted**"), it is a point-in-time call about one release, not a ban on recording changes.

## Decision

The second reading holds: a **user-facing behaviour fix to a published package carries a patch changeset in the PR that makes it**. `.changeset/llms-txt-adoption-sections.md` ships with this story. Whether to cut the release stays the maintainer's call at the merge gate — the changeset records *what changed*, it does not decide *when to publish*.

## Alternatives Considered

- **No changeset, release noted by hand later**: rejected — this is the case where the changeset matters most. Merged without one, adopters keep generating an index missing both adoption sections until someone independently remembers, and there is no artifact tying the fix to a version.
- **Also restore the #391 `scaffold-kb` note `dd1ff524` parked in its commit message**: rejected — out of this story's scope, and it would widen the next release beyond the fix under review. It stays where `dd1ff524` put it, for the maintainer to restore when they cut the release.

## Consequences

- The changesets release PR reopens on merge. That is expected, and it is the maintainer's to close or ship — not a signal this PR is wrong.
- Convention for later stories: published-package behaviour change ⇒ changeset in the same PR; batching happens at release time, not at authoring time.

## Adoption Impact

None — no `adoption/tech/*` file changes.
