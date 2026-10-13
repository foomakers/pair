# Decision: a config reader detects the KEY loosely and accepts the VALUE strictly — and a shipped mirror is a governed copy

## Date

2026-08-28

## Status

Active

## Category

Convention Adoption

## Context

Story #251's review found one failure mode twice — in the resolver and in the gate around it.

1. **The resolver widened silently.** `parseWowProfileSection` matched key AND value with one strict regex. A `## Process Profile` line with an unbackticked VALUE (the shape the schema's key/value TABLE suggests) matched nothing → `{profile: "default", enabled: 12 steps, halts: [], warnings: []}`: a PoC team got `plan-initiatives` and both DDD-mapping steps enabled, nothing reported. The file's own rule says the opposite ("Every case below therefore HALTs rather than narrowing quietly"), and the failure ran in the **widening** direction, which no downstream check looks at.
2. **The gate measured the source, not the loaded copy.** `checkStepMarkers` ran over `dataset/.skills` only. Deleting `<!-- process-step: id=review -->` from `.claude/skills/pair-process-review/SKILL.md` left 168/168 tests green and `skills:conformance` PASS — a step that cannot tell which step it is, whose gate never fires under `poc`. Same class as #280 ("it measured the DATASET copy only… the binding one is the installed MIRROR").
3. **The manual path had no entrypoint.** Nothing a human with no skills installed reads mentioned the profile.

## Decision

**Detection is loose, acceptance is strict, and an unreadable declaration HALTs.**

- The key regex accepts decoration (`- **profile**:`, `- profile:`, ``- `profile`:``) — "did the author mean to declare this key?".
- The value grammar stays as strict as the schema (backticked tokens) — "is this value readable?".
- A key detected with no readable value is a **HALT that restates the schema shape**, never ignored or guessed. The two questions must not share one regex.
- Two distinguished messages: `custom` with **no** `whitelist` key is not `custom` with an **empty** one.

**The rule binds every level of the declaration** (round 2, both verified on the shipped resolver):

- **The SECTION HEADING is detected as loosely as the key.** `## Process profile` over a valid `` - `profile`: `poc` `` resolved to `{profile: "default", enabled: 12 steps, halts: [], warnings: []}`. The comparison is **equality on normalized text**, never a prefix — `## Process Profile Gate` stays a different section. Normalization strips decoration on **every** side (round 13): emphasis, code ticks, a closed-ATX `#` run, a trailing parenthetical, trailing punctuation; a **leading** non-alphanumeric run and an optional `N.`/`N)` numbering; `-`/`_` map to a space and whitespace runs collapse. Trailing-only stripping left `## 🎯 Process Profile`, `## 1. Process Profile`, `## Process  Profile` and `## Process-Profile` resolving to `default` (12 steps, zero halts); the corpus's house style is emoji headings (`## 🎯 Quick Start Process` in `AGENTS.md`/`CLAUDE.md`, `# 🤝 Way of Working` in the shipped template) and `Process-Profile` is story #251's own spelling.
- **Readability is decided on the RESIDUE, not token count.** `values.length === 0` accepted ``- `whitelist`: `implement`, review`` — kept `implement`, dropped `review`, no halt, one misleading prerequisite warning. Strip backticked spans and separators; any residue HALTs the whole line. For `profile`, more than one backticked value is unreadable, not "take the first".

The key case widened; the whitelist case NARROWED — the worse of the two per the schema, since a removed step is indistinguishable from a step not being due.

**"Every level" includes WHERE the section sits** (round 3, verified against this repo's own `way-of-working.md`):

- **A second `## Process Profile` section was silently ignored** (first match wins). The shipped template and this repo's adoption file both carry a present but **empty** section, so a team obeying the schema ("the profile lives only in way-of-working.md, in a `## Process Profile` section") by APPENDING one got `{profile: "default", enabled: 12, halts: [], warnings: []}`.
- **The heading LEVEL was outside loose detection.** `### Process Profile` over a valid `poc` key was neither a section nor reported.

Both HALT. The level check is a **separate scan**, not a widening of `sectionOfWhere`'s `^##` predicate, which also decides where a section ENDS: in `## The Catalogue` / `## Built-in Profiles` / `## Quick Start Process` an `###` is legitimately inside.

**"Every level" reaches the KEY and its LIST MARKER** (round 4, verified against the shipped catalogue and built-ins):

- **The same key on two lines resolved last-wins, silently, and order-dependently.** `` - `profile`: `poc` `` then `` - `profile`: `custom` `` → `{profile: "custom", enabled: ["implement"], halts: [], warnings: []}` (8 steps → 1, nothing reported); the reverse order tripped the "whitelist under a built-in" HALT. Both orders now return one HALT naming the key. Counting is per key, since the round-2 and round-3 guards leave this rung untouched.
- **The marker class was `[-*]`.** `` + `profile`: `poc` `` (`+` is a CommonMark bullet) resolved to `default`, 12 steps, zero halts. All three bullets are accepted.
- **A bullet-less or ordered-list key is DETECTED.** `` `profile`: `poc` `` (the `| profile | … |` table shape) and `` 1. `profile`: `poc` `` now land in `unreadable` and HALT with the schema. Detection there requires the key **backticked** — without a list marker the only signal separating a declaration from a sentence; looser would read the schema's prose as configuration (narrowed in round 10).

**The LEXICAL layer: the reader reads CommonMark, not lines** (round 5, verified against the shipped catalogue and built-ins):

- **Line endings are normalized once, at the parse boundary.** Every line regex ends `(.*)$` with no `m` flag — `.` cannot match `\r` and `$` anchors at end-of-string — so on CRLF nothing matched: `parseWowProfileSection` returned `{profile: null, unreadable: [], duplicateKeys: [], sectionHalts: []}` and the resolve `{profile: "default", enabled: 12, halts: [], warnings: []}`, every rule above silent at once. CRLF is the Windows default (`core.autocrlf=true`), i.e. what `pair update` writes there; the PRESCRIBED shape was ignored while the off-marker shape still HALTed.
- **A fence is a fence however spelled; the recognizer accepts exactly what the skipper skips.** Example extraction matched only ` ```[a-z]*\n `, so a titled fence, uppercase info string or `~~~` block was invisible to the gate yet skipped by the parser. Inside the section only ```was skipped, so a`~~~`or four-space-indented illustration was read as the declaration (the indented one BECAME the profile, 12 → 8 steps; the`~~~`one HALTed`/pair-next` on a placeholder id). One fence scanner serves both, closing only on the opening character.
- **Three CommonMark heading spellings were neither matched nor reported**: `## Process Profile ##` (closed ATX), up-to-three-space indent, and setext — each `{profile: "default", enabled: 12, halts: [], warnings: []}` over a valid `poc`. The first two are accepted as decoration; setext HALTs.

**The LAYOUT half: a key is one line at the top level, and a document not visible whole is not read** (round 6, verified against the shipped catalogue and built-ins):

- **A value spilling past its key's line HALTs.** The residue check erased a trailing `,`, so a wrapped whitelist read as complete and the continuation was discarded: the `poc` id set on ONE line → `{profile:"custom", enabled:8}`, hand-wrapped → `{profile:"custom", enabled:4, halts:[], warnings:[]}`, no prerequisite warning (the surviving prefix was prerequisite-closed). A `custom` example runs past 130 columns; markdownlint's default line length is 80 (this repo disables MD013; an adopter may not). Dangling separator and lazy continuation are detected on the RAW remainder.
- **An indented key HALTs.** Four spaces or a tab is both an indented code block and a sublist item: as code, `- Configuration:` + 4-space `` - `profile`: `poc` `` → `{profile:"default", enabled:12, halts:[], warnings:[]}`; two-space → `{profile:"poc", enabled:8}` — editor Tab width decided. Gate-safe: no shipped indented key line.
- **A fence closes on a run at least as long as its opener.** The scanner tracked the character, not the length, so an inner three-backtick fence closed an outer four-backtick block — the standard way to SHOW a backticked declaration. Beside a real declaration it collided into `` `## Process Profile` declares `profile` more than once (2 lines) `` on a key written once; alone, it became the profile.
- **An HTML comment is not content.** A heading inside `<!-- ... -->` counted, so parking an old declaration HALTed every run with "keep one section". Comments are masked before heading/key scanning, like fences.
- **A truncated view is not a view.** An unterminated ` ```text ` above a valid `poc` section → `{profile:"default", enabled:12, halts:[], warnings:[]}`, `profileSectionProblems` silent. An unterminated fence or comment now HALTs the file.

**A worked example is labelled by what it DECLARES.** Every HALT path returned `profile: 'default'`, so a corrupted `custom` example read `worked example (`default`)` — contradicting the message (`default` takes no whitelist). Examples are labelled by position and declared name.

**The sweep covers every shipped surface carrying a declaration.** `apps/website/content/docs/**` and this repo's `.pair/adoption/tech/way-of-working.md` (what `/pair-next` reads here) carried the same examples ungated. Precedent for reaching outside the package: `MIRROR_SKILLS_DIR`; each file is swept only when present, so an adopter's knowledge-hub checks what it ships (reversed for this list in round 10).

**A shipped worked EXAMPLE is recognized by its key lines, not a heading inside its fence.** `extractProfileExamples` required `## Process Profile` inside the fence; the shipped adoption **template** puts bare key lines in a fence under the section, so none of its examples were checked while the gate said they were. Verified: `plan-stories` → `plan-storys` in the template's `custom` example printed `PASS — 44 skills conformant`, exit 0; now `dataset/.pair/adoption/tech/way-of-working.md: worked example (default): unknown step id(s) plan-storys ...`, exit 1. A fence with a `profile`/`whitelist` key line is an example, given the enclosing heading when it has none.

**A convention's normative snippet is pinned to its corpus.** `process-profile-gate.md`'s "what stays in the skill" block prescribed a delta none of the twelve skills carries; `checkOneStepMarker` only requires marker + pointer somewhere in the dir. The snippet is now the `/pair-process-refine-story` block verbatim, asserted byte-equal.

**A shipped mirror is a governed copy, not a build artifact.** `skills:conformance` and the conformance suite bind marker + gate pointer on `.claude/skills/pair-*/SKILL.md` too, mapping names through the real `pair update` transform (`installedSkillDir`).

**The manual path is governed at its entrypoint.** `AGENTS.md`'s "Without skills" flow carries a profile step before "identify your task"; `checkManualPathEntrypoint` asserts it on the SECTION, not the file.

**A HALT yields NO step set — a discriminated union** (round 7). HALT paths returned `{profile: 'default', enabled: <the whole catalogue>, halts, warnings: []}`; both callers read `halts` first, but a caller reading `resolution.enabled` without checking `resolution.halts` would get the full 12 steps on an unreadable declaration. `ProfileResolution` is now `ResolvedProfile { ok: true, profile, enabled, warnings } | HaltedProfile { ok: false, halts }`; callers use `profileProblems(resolution)`. Prose readers too: a HALT stops the run, it does not continue on `default`.

**A file the gate names as checked is read as what it IS** (round 7). This repo's `way-of-working.md` was only in the example sweep and its section has no fenced example, so ZERO checks applied while PASS named it. Verified: `` - `profile`: `pocc` `` printed `PASS — 44 skills conformant`, exit 0, while `/pair-next` would HALT on ``unknown process profile `pocc` ``. Both way-of-working files now go through `resolveProcessProfile` as declarations (`PROFILE_DECLARATION_FILES`), plus the sweep. A docs `.mdx` page stays example-only.

**A documentation TABLE row is not a declaration** (round 7). The off-marker comment claimed to catch the `| profile | … |` row; the `^`-anchored pattern needing `:` after the key never did — and must not, since the shipped template and KB schema document the keys in such a table. Exclusion stated and pinned by a unit case.

**A decoration is a declaration; a quotation is documentation — the line is written down** (round 8, verified against the shipped catalogue and built-ins). A **blockquoted** key escaped both patterns (`^\s*[-*+]` — `>` is not whitespace — and `^[ \t]*`): `> **Note**: PoC subset.` / `>` / `` > - `profile`: `poc` `` → `{ok: true, profile: 'default', enabled: <all 12>, warnings: []}`. It now HALTs — the OPPOSITE of the table-row ruling on purpose: the table row is how the schema and template DOCUMENT the keys; a blockquoted list item appears nowhere as documentation (`grep -rn "^> [-*+] "` over `.pair/adoption/` and the dataset copy: zero hits). Both halves are stated in the schema, the adoption template, `/pair-next` Step 0.5 and both docs pages, pinned by unit cases both ways. Second arm: a blockquote OPENS a block, so blockquoted prose under a key line is no longer a lazy continuation (it had HALTed a readable declaration as "spilled").

**A repeated step id in a whitelist HALTs, never deduped silently** (round 8). `` - `whitelist`: `implement`, `implement` `` → `{ok: true, profile: 'custom', enabled: ['implement', 'implement'], warnings: [<the prerequisite warning>, <the byte-identical string again>]}` — warned twice, every "N steps enabled" count wrong. The same mistake one rung up (key on two lines, two `profile` values) already HALTs, and a repeat is as plausibly an unedited copy-paste (the `plan-storys` class) as a harmless duplicate.

**The key's CASE is detection-side; the value's is not** (round 9, verified against the shipped catalogue and built-ins). Key patterns were case-sensitive while the heading above (`## Process Profile`, Title Case) matches case-insensitively. `` - `Profile`: `poc` `` → `{ok: true, profile: 'default', enabled: <all 12>, warnings: []}`; `` - `profile`: `custom` `` + `` - `Whitelist`: `implement` `` HALTed "profile `custom` declares no `whitelist` — `custom` requires one: add ``- `whitelist`: …``" about a line in the file — the schema's own anti-pattern ("one message sends the reader hunting for a line their file does not have"). All three patterns are now case-insensitive, canonicalized to lowercase at one point (`canonicalKey`), so the duplicate counter sees two spellings as one key twice and messages print the canonical name. Rejected shapes (off-marker, blockquoted `` `Profile` ``) still HALT; `` - `profile`: `POC` `` still HALTs as unknown. Gate-safe: `grep -rniE` over every gate-read file (both way-of-working files, KB schema, shipped template, both docs pages) finds no case-variant key line; a case-variant TABLE row stays no declaration.

**Two author errors on one line compose; they do not cancel** (round 10, verified against the shipped catalogue and built-ins). The REJECTED-marker patterns required a backticked key, the ACCEPTED-bullet one did not: `- profile: poc` HALTed, `` 1. `profile`: `poc` `` HALTed, but `1. profile: poc` and `> - profile: poc` → `{ok: true, profile: 'default', enabled: <all 12>, warnings: []}`. The backtick rationale ("without a list marker that is the only signal separating a declaration from a sentence mentioning the key") does not apply where `1.` or `> -` is a marker. Backticks are now required only on the marker-less line (`` `profile`: `poc` `` HALTs; `profile: poc` stays prose); padding inside ticks (`` - ` profile `: `poc` ``) is decoration.

**A guard that cannot find its input says so** (round 10). `checkShippedProfileProse` skipped absent paths in both loops: a MISSING or RENAMED governed file went unchecked under a PASS banner naming all five, and `checkShippedProfileProse(<empty tmpdir>, …)` returned `[]`. Two of the five live in `apps/website/content/docs/**`, so a docs reorg dropped a page silently. Absence is now an error naming the path and the two lists to update — the fail-closed rule in `approval-rounds.md` ("a guard that answers 'nothing to check' when it cannot parse its input is indistinguishable from a guard that passes").

**A GENERATED copy is a governed copy too — for the KB and the root entrypoints** (round 11). The gate bound the dataset sources of the step catalogue, profile schema and `AGENTS.md`, not `.pair/knowledge/**/step-catalogue.md`, `.pair/knowledge/**/process-profiles.md`, root `AGENTS.md`/`CLAUDE.md`. Verified: deleting the installed catalogue's `` `brainstorm` `` row and typo-ing `poc`'s first id (`spcify-prd`) printed `PASS — 44 skills conformant`, exit 0; so did replacing the manual-flow step in both root files (undoing AC8 here — `checkManualPathEntrypoint` read `dataset/AGENTS.md` only). `checkInstalledProfileCorpus` binds step ids, how-to, `requires` and built-in whitelists to the dataset (executables via `installedSkillDir`) and runs the manual-path check on both root files. Gated on the installed KB tree existing; present ⇒ each governed file is REQUIRED (round-10 rule).

**A per-skill obligation is checked per skill** (round 11). AC6 asks each of the twelve step skills for the direct-invocation gate; enforced was marker + `process-profile-gate.md` anywhere, with the sentence byte-pinned for two (`refine-story`, `map-subdomains`). Verified: deleting the delta sentence from `dataset/.skills/process/implement/SKILL.md` AND mirror left `PASS — 44 skills conformant` and 107 green tests. The delta is now checked as CLAUSES (direct ⇒ warn + confirm/HALT; composed ⇒ never prompts, degrades as not installed) over the `## Process Profile` section plus disclosed siblings — not byte-for-byte, since the corpus ships three legitimate shapes (plain, `$approval`-family, `brainstorm`'s disclosed half). A link climbing OUT of the skill dir does not count (the convention states both clauses).

**A section ends at a level-1 heading too** (round 11). `sectionOfWhere` stopped only at `##`: `## Process Profile` + `` - `profile`: `poc` `` + `# Other` + `` - `profile`: `custom` `` HALTed "declares `profile` more than once (2 lines)" — safe direction, misleading message. `###`+ stays INSIDE, pinned. No shipped file changes: every later level-1 heading in gate-read files sits in a fence.

**A composition beat states the profile per COMPOSED STEP** (round 11). `/pair-process-bootstrap` declares three composed steps; the guard wanted one clause before `## Graceful Degradation`, satisfied by the two `map-*` beats, so Phase 0 Step 0.1 still read "**Act** (missing or template): Compose `/pair-process-specify-prd`." A `custom` whitelist with `bootstrap` but not `specify-prd` is legal (AC9 reports, does not repair), so an executor ran an interactive PRD session — which WRITES an adoption file — for a disabled step. The beat carries the check; the guard asserts the clause per composed step id in the composer's delta, inside the same `##`/`###` block as that step's executable.

**Binding a generated copy means its PROSE, and all three files of the feature** (round 12). Verified, then reverted: reducing `.pair/knowledge/**/skill-conventions/process-profile-gate.md` to `# Process Profile Gate` + `TODO` printed `PASS — 44 skills conformant`, exit 0 — the file all twelve installed step skills point at, sole home of the prompt wording, "proceed silently, byte for byte", the HALT carve-out and `$approval: auto` ⇒ `auto=halt` (gone, an unattended run proceeds); `` `specify-prd` `` → `` `spcify-prd` `` in the installed `process-profiles.md` example was unreported while the DATASET typo failed. The sweep is now path-based (`profileExampleErrors`) over both installed KB copies, and the installed convention is read fail-closed for the DIRECT/COMPOSED clauses plus `auto=halt` (carried by no delta).

**A guard whose subject list comes from the file under test de-scopes itself** (round 12). The composers guard took ids from the delta's `composer of` clause, with one global `perComposedStep.length > 0` backstop. Verified: `plan-tasks`' delta rewritten to "a composer of the context-mapping capability" and its Step 2.5 beat gutted (dataset AND mirror) → `pnpm skills:conformance` PASS, exit 0, `process-profile.test.ts` `Tests 112 passed` (DOWN from 114, two `it.each` cases vanished). The claim is cross-checked against the `## Composed Skills` table, and the composer list is corpus-derived.

**A completion report is a governed surface** (round 12). `/pair-next` cascade/fallback, direct invocation and composition were governed; the `Next:` line was not. On the `custom` example this branch ships (`specify-prd, plan-initiatives, plan-epics, plan-stories, refine-story, plan-tasks, implement, review` — the "we do no DDD" case), `/pair-process-plan-initiatives` ended `Next: /pair-capability-map-subdomains (scoped to this initiative) or /pair-process-plan-epics`. `/pair-next` Step 5's rule ("never name a disabled step") is now stated once in the convention and applied by every report naming a catalogued step.

## Alternatives Considered

- **Keep the strict regex and document harder**: rejected — the bad line came from copying the file's own table; the failure is silent by construction.
- **Accept an unbackticked value**: rejected — grammar becomes guessable ("is `poc.` a profile name?").
- **Assert the mirror by byte-equality only** (`skill-md-mirror`): rejected — directional dataset→mirror equality catches a _drifted_ copy, not a hand-edited one both guards read as legitimate; the marker is what the profile hangs on.
- **A follow-up card for the manual path**: rejected by AC8 and the success metric ("a project with no skills installed gets the same profile behaviour through the how-to path").
- **Return `enabled: []` on HALT** (round 7): rejected — trades widening for NARROWING, the worse direction. No honest step set exists; the test file's flat view reports `profile`/`enabled` as `null` on a HALT, asserted by every halt case.
- **Dedupe whitelist ids** (`[...new Set(whitelist)]`, round 8, the finding's first suggestion): rejected — a silent repair picking one reading of an ambiguous line.
- **Treat a blockquoted key as documentation** (round 8): rejected — the table row must stay documentation because governing files carry one; a blockquoted key appears nowhere, so HALTing costs nothing. The asymmetry is written at every prose surface.
- **Route a case-variant key to `unreadableShapeHalt`** (round 9): rejected — rules case opposite to the heading and to every honoured decoration (bold, missing backticks, three bullets); HALT is for unacceptable VALUES. Rejected MARKER shapes keep their HALT.
- **Keep backticks required behind an ordered marker / in a blockquote** (round 10): rejected — that produced the hole; the combination is the likelier mistake (marker from the numbered prose, bare value from the table, same page).
- **Keep skipping an absent governed file** (round 10): rejected — `existsSync`-guarding each entry was meant to let an adopter's knowledge-hub check only what it ships, but the list is fixed and all five ship here; a legitimate move is a one-line edit to `PROFILE_PROSE_FILES` / `PROFILE_DECLARATION_FILES`, the edit the gate should force.
- **Pin each delta to the snippet byte-for-byte** (round 11): rejected — three legitimate shapes, two quoted; it would redden `brainstorm` (half disclosed to `degradation.md` under a byte budget) or force duplication. Clause check, as `approval-round` markers do against layout-derived windows, one notch looser.
- **Widen `sectionOfWhere` to any level** (round 11): rejected as in round 3 — `###` sub-headings sit inside `The Catalogue`, `Built-in Profiles` and `Quick Start Process`; ending there truncates the three parsed documents. Only the START is level-2-exact; `# Process Profile` is the mis-levelled HALT.
- **Rely on `mirror-guard.test.ts` for generated copies** (round 11): rejected — it asserts byte-equality with `transform(dataset)` for the KB tree and both root files and catches these in the full suite, but `skills:conformance`'s PASS banner names these files (round 7) and gives the actionable message ("the installed copy declares no step `brainstorm`").
- **Compare the installed convention byte-for-byte via `installedSkillDir`** (round 12): rejected — `mirror-guard.test.ts` covers equality; this gate owes the profile message ("no longer resolves the gate for an UNATTENDED run"), the same clause rule `checkStepDelta` applies — one rule, two levels.
- **Scan each skill's algorithm for named executables** (round 12): rejected THEN, **adopted in round 13 narrowed** (next bullet). A whole-body scan before `## Graceful Degradation` returns 40 ids, mostly not compositions (`Next:` lines, "not for X, use `/y`", Callers matrices); 34 would redden.
- **Restrict the scan to the OBJECT of a composition verb** (round 13): adopted. `/compos\w*[^.;:\n—]{0,60}/` (a `compos*` token and the ≤60 characters after it, stopped at the first sentence/clause boundary) yields for the four composers exactly the declared set (dataset **and** mirror: `bootstrap` → `specify-prd`, `define-subdomains`, `define-bounded-contexts`; `refine-story` → both `map-*`; `plan-tasks` → `define-bounded-contexts`; `plan-epics` → `define-subdomains`). Not a third declaration: removing the composition from the algorithm is the skill ceasing to compose.
- **Keep the subject list on delta + `## Composed Skills` alone** (round 13): rejected — same author, same file, one pass. Deleting `define-subdomains` from `/pair-process-bootstrap`'s `composer of` clause and its `/pair-capability-map-subdomains` row (dataset + mirror) left `Tests 147 passed`, DOWN from 149; gutting the Phase-3.5.1 beat then landed green, reintroducing round 11's failure. The list is the **union** of the three sources.
- **Filter only the three named `Next:` lines** (round 12): rejected — the guard finds five more (`brainstorm`, `plan-epics`, `plan-stories`, `plan-tasks`, `refine-story`); exempting them rebuilds the hand-written-list defect.
- **Resolve the docs `.mdx` pages as declarations** (round 7): rejected — page prose is resolved by nobody; its fenced examples are swept already.

## Consequences

- A mis-shaped `## Process Profile` section stops the run with the schema handed back instead of restoring the full process.
- `skills:conformance` fails on a hand-edited or half-regenerated mirror. Verified: `review` marker deleted from the mirror → `mirror: pair-process-review/SKILL.md: … declares no <!-- process-step: id=review --> marker`, exit 1 (green before).
- Shipped worked EXAMPLES go through the real resolver; one resolving with a prerequisite warning is red (the defect in `process-profiles.md`'s own `custom` example).
- `.claude/skills/**` is in the conformance surface: a dataset edit needs a mirror regeneration, which `pair update` already does.
- Appending an unbackticked id to a working whitelist returns the schema instead of losing that step for the project's life.
- A decorated heading is honoured; a cosmetic edit cannot disable the section.
- An **appended** `## Process Profile` section (instead of editing the empty shipped one), or one at `#`, `###` or deeper, HALTs naming the problem.
- A second `profile` (or `whitelist`) line HALTs naming the key, in either order.
- `+` joins `-` and `*`; a bullet-less or numbered key line stops the run. A `-` section sees no change.
- Corrupting a worked example in the shipped `way-of-working.md` template is red.
- The PASS line enumerates this story's checks, so green is evidence they ran.
- Windows (CRLF from `pair update`) behaves like Unix.
- An illustrative code block, in any of the three CommonMark forms, is never read as the profile and always checked as an example.
- A docs edit retitling a fence or shortening a website whitelist is red.
- A linter forbidding 130 columns means exempting the line: the schema and adoption template state a key is one line however long; wrapping HALTs.
- Commenting out a section parks a previous profile; an unterminated fence or comment anywhere in way-of-working.md stops the run.
- A `resolveProcessProfile` caller cannot read a step set from a halted resolution — the compiler rejects it.
- A profile typo in **this repo's** way-of-working is red. Verified: `` - `profile`: `pocc` `` → ``FAIL — 1 violation / ../../.pair/adoption/tech/way-of-working.md: unknown process profile `pocc` …``, exit 1 (`PASS`, exit 0, before).
- The four composers reaching DDD mapping — `refine-story`, `plan-tasks`, `plan-epics`, `bootstrap` — name the profile at the composition beat and in graceful degradation, as `brainstorm` did; under `poc` none composes `/pair-capability-map-subdomains`.

- `` > - `profile`: `poc` `` stops the run naming the shape; a documentation table row costs nothing; both rules are readable without the code.
- A whitelist naming a step twice stops the run naming the id.
- `` - `Profile`: `poc` `` gets the declared profile; a capitalized `whitelist` line is no longer "no whitelist". No shipped file carries a case-variant key.
- A half-run `pair update` or hand edit of `.pair/knowledge/**/step-catalogue.md`, `.pair/knowledge/**/process-profiles.md` or root `AGENTS.md`/`CLAUDE.md` is red. Verified: catalogue minus `brainstorm` + `spcify-prd` in installed `poc` → `FAIL — 2 violations`, exit 1; manual-flow step replaced in both root files → `FAIL — 6 violations`, exit 1 (both `PASS — 44 skills conformant`, exit 0, before).
- Any of the twelve step skills losing its delta sentence is red, dataset and mirror. Verified: deleted from `/pair-process-implement` in both → `FAIL — 4 violations`, exit 1 (`PASS`, exit 0, with 107 conformance tests green, before).
- A key under a later level-1 heading is out of the section; no phantom duplicate.
- `/pair-process-bootstrap` composes `/pair-process-specify-prd` only when enabled; disabled, it degrades as "not installed" — HALT at Phase 0 with the how-to-01 pointer.

- Gutting the installed gate convention is red. Verified: `# Process Profile Gate` + `TODO` → `FAIL — 3 violations`, exit 1 (DIRECT, COMPOSED, `auto=halt`); a typo in the installed schema's `custom` example → `FAIL`, exit 1 (both `PASS — 44 skills conformant`, exit 0, before).
- A composer that stops naming a composed id reddens. Verified: `plan-tasks`' delta naming no id → 4 failed; one of two ids dropped from `refine-story`'s → 3 failed (`Tests 112 passed` before).
- No completion report names a disabled step: eight reports carry the filter; a ninth reddens until it does.

- A house-style heading is the section. Verified on this repo's `way-of-working.md`, `` - `profile`: `pocc` `` under `## 🎯 Process Profile`, `## 1. Process Profile`, `## Process  Profile`, `## Process-Profile` → `FAIL — 1 violation`, exit 1 (all `PASS — 44 skills conformant`, exit 0, before). `## Process Profile Gate` and `## Process-Profile-Gate` stay different sections.
- The composers guard cannot be de-scoped via its two declarations. Verified: `/pair-process-bootstrap`'s delta clause and `/pair-capability-map-subdomains` row deleted in dataset and mirror → still 149 tests (147, green, before); gutting Phase-3.5.1 then → 2 failed (green before).
- The convention's fourth clause is bound in the installed copy. Verified: the completion-report paragraph deleted from `.pair/knowledge/**/process-profile-gate.md` → `FAIL — 1 violation`, exit 1 (`PASS — 44 skills conformant`, exit 0, before).

## Adoption Impact

None for adopters' code. Changes `packages/knowledge-hub/src/tools/skills-conformance-check.ts`, the shipped `AGENTS.md` template (one manual-flow step, mirrored to root `AGENTS.md`/`CLAUDE.md` by `pair update`) and the profile schema's error-case table. Adopters inherit the stricter reader and the step on their next `pair update`; a well-formed section sees no change. Round 12 adds one line to the gate convention and one sentence to the eight step skills whose report names a catalogued step; under `default` no report changes.
