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

**"Every level" reaches the KEY and its LIST MARKER — the two rungs between the section and the value** (round 4, all three verified on the shipped resolver against the shipped catalogue and built-ins):

- **The same key on two LINES of one section resolved last-wins, silently.** `` - `profile`: `poc` `` followed by `` - `profile`: `custom` `` returned `{profile: "custom", enabled: ["implement"], halts: [], warnings: []}` — the `poc` line evaporated with nothing reported, and a team narrowed from 8 steps to 1 without a word. It was also **order-dependent**: the reverse order tripped the "whitelist under a built-in" HALT instead, so the same two lines halted or not depending on which came first. Now both orders return the same HALT naming the key. Counting is per key, not per section, because the section-level guard (round 3) and the value-level guard (round 2) each leave this rung untouched.
- **The marker class was `[-*]`.** `` + `profile`: `poc` `` — `+` is a CommonMark bullet, so that line IS "a backticked list item", exactly what the schema instructs — resolved to `default` with all 12 steps, zero halts: byte-identical to writing nothing. All three bullets are accepted.
- **A bullet-less or ordered-list key is DETECTED, not invisible.** `` `profile`: `poc` `` (the shape the `| profile | … |` schema table suggests) and `` 1. `profile`: `poc` `` were text the reader walked past, so they widened in silence too. They now land in `unreadable` and HALT with the schema handed back. Detection there requires the key to be **backticked**: without a list marker that is the only signal separating a declaration from a sentence about the key, and a looser test would read the schema's own prose as configuration.

**Below the key, the marker and the section there is a LEXICAL layer, and the rule binds it too: the reader reads CommonMark, not lines of text** (round 5, all verified on the shipped resolver against the shipped catalogue and built-ins):

- **Line endings are normalized once, at the parse boundary.** Every line regex here ends in `(.*)$` with no `m` flag — `.` cannot match `\r` and `$` anchors at end-of-string — so on a CRLF file NOTHING matched: `parseWowProfileSection` over a CRLF `## Process Profile` section carrying a valid `` - `profile`: `poc` `` returned `{profile: null, unreadable: [], duplicateKeys: [], sectionHalts: []}` and the full resolve returned `{profile: "default", enabled: 12, halts: [], warnings: []}` — byte-identical to writing nothing, with **every** rule above silent at once. CRLF is the default checkout on Windows (`core.autocrlf=true`), i.e. the file `pair update` writes there. The inversion was exact: on a CRLF file the shape the schema PRESCRIBES was ignored while the off-marker shape it REJECTS still HALTed.
- **A fence is a fence however it is spelled, and the recognizer must accept exactly what the skipper skips.** Example extraction matched only ```` ```[a-z]*\n ````, so a titled fence, an uppercase info string or a `~~~` block made a worked example invisible to the gate — while the section parser's own skipper still skipped it, leaving that shape neither read as a declaration nor checked as an example. Inside the section the mirror-image hole: only ``` blocks were skipped, so a `~~~` or four-space-indented illustration was read as the project's real declaration (the indented one silently BECAME the profile, 12 steps → 8, nothing reported; the `~~~` one HALTed `/next` on a placeholder id the project never configured). One fence scanner now serves both, closing only on the character that opened it.
- **Three CommonMark-valid heading spellings were neither matched nor reported**: `## Process Profile ##` (closed ATX), a heading indented by up to three spaces, and the setext form. Each resolved to `{profile: "default", enabled: 12, halts: [], warnings: []}` over a valid `poc` declaration. The first two are decoration in the same sense as emphasis and are now accepted; the setext form is not the shape this reader accepts and HALTs, because a heading that is neither read nor reported is the widening direction one more time.

**A worked example is labelled by what it DECLARES, never by what the failure resolved to.** Every HALT path returns `profile: 'default'`, so a corrupted `custom` example was reported as `worked example (`default`)` — and `default` accepts no whitelist at all, so the label contradicted the message and pointed a maintainer at the wrong fence. Examples are now labelled by position and by their declared name.

**The sweep covers every shipped surface carrying a declaration, not only the two the feature was written from.** `apps/website/content/docs/**` (the feature's public documentation) and this repo's own `.pair/adoption/tech/way-of-working.md` (the file `/next` reads when run here) carried the same worked examples with no gate behind them — the same blast radius as the template hole, on the page a reader is likeliest to copy from. The precedent for reaching outside the package already existed (`MIRROR_SKILLS_DIR`); each file is swept only when present, so an adopting project's knowledge-hub checks exactly what it ships.

**A shipped worked EXAMPLE is recognized by its key lines, not by a heading inside its fence.** `extractProfileExamples` required a `## Process Profile` line *within* the fenced block. The KB schema writes its examples that way; the shipped adoption **template** does not — its heading is the section the fence sits in, and the fence holds bare key lines. So the file `pair update` writes into every adopting project had **none** of its examples checked while the gate reported them checked. Verified: replacing `plan-stories` with `plan-storys` in the template's `custom` example printed `PASS — 44 skills conformant`, exit 0; now it prints `dataset/.pair/adoption/tech/way-of-working.md: worked example (default): unknown step id(s) plan-storys ...` and exits 1. A fence carrying a `profile`/`whitelist` key line is an example; with no heading of its own it is given the one it is an example OF.

**A convention's normative snippet is pinned to the corpus it governs.** `process-profile-gate.md`'s "what stays in the skill" block prescribed a delta none of the twelve shipped skills carries. `checkOneStepMarker` only requires the marker plus the pointer *somewhere* in the skill dir, so a thirteenth author copying that snippet verbatim would land a differently-worded delta with every gate green. The snippet is now the `/refine-story` block verbatim, and a conformance test asserts the two are byte-equal.

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
- A team hand-adding a second `profile` (or `whitelist`) line under an existing section gets a HALT naming the key, and the same one whichever order the two lines are in.
- `+` joins `-` and `*` as an accepted bullet; a bullet-less or numbered key line stops the run instead of resolving to `default`. A project whose section already uses `-` sees no change.
- Corrupting any worked example in the shipped `way-of-working.md` template is now a red gate, not a shape CI certifies and every adopting project copies.
- The gate's PASS line enumerates the checks this story added, so a green run is evidence they ran.
- A project on Windows gets the same profile behaviour as one on Unix: the CRLF checkout `pair update` produces there no longer resolves to `default` in silence.
- An illustrative code block next to the real declaration — in any of the three CommonMark forms — is an example on both sides of the reader: never read as the profile, always checked as an example.
- A docs edit that retitles a fence, or one that shortens a whitelist on the website, is now a red gate rather than a shape CI certifies and readers copy.

## Adoption Impact

None for adopters' code. It changes `packages/knowledge-hub/src/tools/skills-conformance-check.ts`, the shipped `AGENTS.md` template (one manual-flow step, mirrored to root `AGENTS.md`/`CLAUDE.md` by `pair update`) and the profile schema's error-case table. An adopting project inherits the stricter reader and the new manual-flow step on its next `pair update`; a project whose way-of-working already carries a well-formed section sees no change.
