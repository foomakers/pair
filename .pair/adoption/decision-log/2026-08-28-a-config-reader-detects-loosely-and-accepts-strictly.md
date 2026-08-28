# Decision: a config reader detects the KEY loosely and accepts the VALUE strictly — and a shipped mirror is a governed copy

## Date

2026-08-28

## Status

Active

## Category

Convention Adoption

## Context

Story #251's review found the same failure mode twice, on both sides of the profile: the resolver, and the gate around it.

1. **The resolver widened silently.** `parseWowProfileSection` matched one strict regex for a key AND its value. A `## Process Profile` section whose profile line left the VALUE unbackticked — the shape the schema's key/value TABLE suggests, rather than the fenced example — matched nothing, so the section resolved to `{profile: "default", enabled: 12 steps, halts: [], warnings: []}`. A PoC team got the full process, `plan-initiatives` and both DDD-mapping steps enabled and proposable, with nothing reported anywhere. The file's own normative rule is the opposite ("Every case below therefore HALTs rather than narrowing quietly"), and the failure ran in the **widening** direction — the one direction no downstream check looks at.

2. **The gate measured the source, not the loaded copy.** `checkStepMarkers` ran over `dataset/.skills` alone. Deleting `<!-- process-step: id=review -->` from `.claude/skills/pair-process-review/SKILL.md` left 168/168 tests green and `skills:conformance` PASS — a step that can no longer tell which step it is, whose profile gate never fires under `poc`, with every gate green. Same class as #280 ("it measured the DATASET copy only… the binding one is the installed MIRROR").

3. **The manual path had no entrypoint.** The catalogue makes the step→how-to mapping expressible; nothing a human with no skills installed reads mentioned the profile at all.

## Decision

**Detection is loose, acceptance is strict, and an unreadable declaration HALTs.**

- The key regex accepts decoration (`- **profile**:`, `- profile:`, `` - `profile`: ``) — the question it answers is "did the author mean to declare this key?".
- The value grammar stays exactly as strict as the schema (backticked tokens) — "is this value readable?".
- A key detected with no readable value is neither ignored nor guessed: it is a **HALT that restates the schema shape**. The two questions have different answers and must not share one regex.
- The same principle produced two distinguished messages where one was doing double duty: `custom` with **no** `whitelist` key is not `custom` with an **empty** one.

**The rule binds every level of the declaration, not just the key line** (round 2 — the review found the same hole through two other doors, both verified on the shipped resolver):

- **The SECTION HEADING is detected as loosely as the key.** `## Process profile` (sentence case) over a valid `` - `profile`: `poc` `` resolved to `{profile: "default", enabled: 12 steps, halts: [], warnings: []}` — byte-identical to writing nothing. Matching the heading exactly while matching the keys loosely reopens the widening hole one level up. The comparison is an **equality on normalized text** (emphasis, a trailing parenthetical and trailing punctuation stripped), never a prefix — `## Process Profile Gate` stays a different section.
- **Readability is decided on the RESIDUE, not on token count.** `values.length === 0` accepted a PARTIALLY backticked line: `` - `whitelist`: `implement`, review `` kept `implement` and dropped `review` on the floor, with no halt and one misleading prerequisite warning. Strip backticked spans and separators; anything left means the line is unreadable and the whole line HALTs. Applied to `profile` too: more than one backticked value is unreadable rather than "take the first".

The direction differs — the key case widened, the whitelist case NARROWED — and the schema calls narrowing the worse of the two, because a removed step is indistinguishable from a step not being due.

**"Every level" includes WHERE the section sits, not only what it says** (round 3 — the last two doors into the same room, both verified on the shipped resolver against this repo's own `way-of-working.md`):

- **A second `## Process Profile` section was silently ignored** (first match wins). This story is what makes that the likely edit: the shipped template AND this repo's own adoption file now both carry a `## Process Profile` section that is present and **empty** (prose only, no keys), so a team obeying the schema's own instruction — "the profile lives only in way-of-working.md, in a `## Process Profile` section" — by APPENDING one, rather than editing the existing paragraph, got `{profile: "default", enabled: 12, halts: [], warnings: []}`: byte-identical to the unmodified file.
- **The heading LEVEL was outside the loose-detection rule.** `### Process Profile` over a valid `` - `profile`: `poc` `` was not a section and, being unmatched, was not reported either — same silent `default`.

Both HALT. The level check is a **separate scan**, deliberately not a widening of `sectionOfWhere`'s `^##` predicate: that predicate also decides where a section ENDS, and for `## The Catalogue` / `## Built-in Profiles` / `## Quick Start Process` an `###` sub-heading is legitimately *inside* the section — widening it would silently truncate parsers no finding is about.

**A shipped mirror is a governed copy, not a build artifact.** `skills:conformance` and the conformance suite now bind the marker + gate pointer on `.claude/skills/pair-*/SKILL.md` as well as on the dataset, mapping names through the real `pair update` transform (`installedSkillDir`) rather than a copy of it.

**The manual path is governed at its own entrypoint.** `AGENTS.md`'s "Without skills" flow carries a profile step before "identify your task", and `checkManualPathEntrypoint` asserts it — on the SECTION, not the file, since a mention parked in an appendix is not an entrypoint.

## Alternatives Considered

- **Keep the strict single regex and document the shape harder**: rejected. The mis-shaped line came from copying the file's own table; prose cannot beat a shape a reader already produced, and the failure is silent by construction.
- **Accept an unbackticked value** (loose acceptance): rejected. It makes the grammar guessable rather than declared, and re-opens "is `poc.` a profile name?" for every value.
- **Assert the mirror by byte-equality only** (leave it to `skill-md-mirror`): rejected. That guard is directional dataset→mirror equality; it catches a *drifted* copy, not a hand-edited one that both guards read as legitimate content — and the marker is the thing the profile hangs on.
- **A follow-up card for the manual path**: rejected by the story's own AC8 and success metric ("a project with no skills installed gets the same profile behaviour through the how-to path").

## Consequences

- A mis-shaped `## Process Profile` section now stops the run with the schema handed back, instead of quietly restoring the full process.
- `skills:conformance` fails on a hand-edited or half-regenerated skills mirror. Verified: deleting the `review` marker from the mirror prints `mirror: pair-process-review/SKILL.md: … declares no <!-- process-step: id=review --> marker` and exits 1 (it was green before).
- The shipped worked EXAMPLES go through the real resolver too, so an example that resolves with a prerequisite warning is a red gate — the class of defect the review found in `process-profiles.md`'s own `custom` example.
- `.claude/skills/**` is now inside the conformance surface for this convention: a mirror regeneration is required after a dataset edit, which `pair update` already does.
- A team appending one id to a working whitelist without backticks now gets the schema handed back, instead of losing that step from every suggestion for the life of the project.
- A decorated `## Process Profile` heading is honoured rather than ignored, so the section cannot be disabled by a cosmetic edit.
- A project that **appends** a `## Process Profile` section instead of editing the empty one the template ships now gets a HALT naming the duplication, rather than the full process back in silence. Same for a section written at `#`, `###` or deeper.

## Adoption Impact

None for adopters' code. It changes `packages/knowledge-hub/src/tools/skills-conformance-check.ts`, the shipped `AGENTS.md` template (one manual-flow step, mirrored to root `AGENTS.md`/`CLAUDE.md` by `pair update`) and the profile schema's error-case table. An adopting project inherits the stricter reader and the new manual-flow step on its next `pair update`; a project whose way-of-working already carries a well-formed section sees no change.
