# Process Profiles

A **process profile** declares which of the [catalogued process steps](step-catalogue.md) a project runs. A team adopting a subset of the process configures it once, in adoption, and no disabled step is ever proposed — by `/pair-next`, by a skill, or by the how-to path a project with **no skills installed** follows.

The KB owns the **schema**, the **built-in profiles** and the **step catalogue**. The profile itself lives **only** in the project's `way-of-working.md`, in a `## Process Profile` section (D19) — nothing here is per-project, and nothing per-project is here.

## Schema

The section carries two keys, in the same shape as the file's other optional sections:

```text
## Process Profile

- `profile`: `poc`
```

```text
## Process Profile

- `profile`: `custom`
- `whitelist`: `specify-prd`, `plan-initiatives`, `plan-epics`, `plan-stories`, `refine-story`, `plan-tasks`, `implement`, `review`
```

| Key         | Values                        | Meaning                                                                          |
| ----------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `profile`   | `default` \| `poc` \| `custom` | Which step set is in force.                                                        |
| `whitelist` | catalogue step ids            | The enabled steps. **Required with `custom`, and invalid with anything else.**     |

Both keys are **backticked list items, and so are their values** — copy a fenced example above verbatim, not the bare key spellings the table uses. The reader detects a key **loosely** (a bolded or unbackticked key is still a declaration, **whatever its case** — `` - `Profile`: `poc` `` declares the same thing) and accepts its value **strictly**: that split is what makes a mis-shaped line a HALT instead of a silent `default`. The key's **case** sits on the detection side for the same reason the heading's does, and the value's does not: `` - `profile`: `POC` `` HALTs as an unknown profile name.

Each key is **one line**, on a `-`, `*` or `+` list item — the three CommonMark bullets, and no others. Declaring the same key **twice** in one section HALTs (only the last would be read, so the earlier value would take effect nowhere), and so does a key written with **no bullet at all** or with an **ordered-list** marker (`1.`, `1)`): both are plausible reads of the table above, and passing over such a line as prose resolves the section to `default` — the widening direction again.

**Two author errors on one line still HALT.** The rejected markers are detected whether or not the key is backticked, so `1. profile: poc` — wrong marker *and* the table's bare spellings — HALTs exactly as the backticked ordered form and the bulleted unbackticked one each do on their own. The backticks are required only on a line with **no list marker of any kind** (`` `profile`: `poc` ``), where they are the sole thing separating a declaration from a sentence that mentions the key; `profile: poc` alone on a line is prose and stays prose.

"One line" is normative, and it is enforced: a value that **spills** — ends on a dangling `,` or continues on the line below — **HALTs**. A wrapped whitelist is the likeliest edit of all, since a `custom` example is easily past a hundred columns and markdownlint's default line-length rule is 80; read up to the wrap it resolves cleanly to the first line's ids alone, and the steps after the wrap vanish from every suggestion with nothing reported. **Keep the whole value on the key's line whatever its length** (in a project whose linter forbids that, exempt this line rather than wrap it).

Each key also sits at the **top level of the section**, indented by no more than three spaces. Four spaces or a tab is both an indented code block and an ordinary **sublist** item, and the line alone does not say which — so it HALTs rather than being read either way: skipping it re-enabled the whole process in silence, while the very same key indented by two spaces was read as a declaration, which made the outcome depend on how wide the author's editor sets Tab.

**A declaration and a quotation of one are different things, and the line between them is written down here rather than left to the reader.** A key inside a **blockquote** (`` > - `profile`: `poc` ``) **HALTs**: `>` is not indentation, so passing over such a line resolves the section to `default` with the whole process re-enabled and nothing reported — and no file in this corpus writes a blockquoted list item, so treating it as a decorated declaration costs nothing. A key inside a **table row** (`` | `profile` | `poc` | ``) is the opposite case and is deliberately **no declaration at all, not even a HALT**: it is the shape this page and the shipped template use to *document* the two keys, so a reader that matched it would HALT on its own governing files. Documentation shapes stay documentation; decorated declarations HALT.

The **heading** is detected loosely for the same reason: `## Process profile`, `## Process Profile (optional)`, `## **Process Profile**`, the closed-ATX `## Process Profile ##` and a heading indented by up to three spaces all name this section. Matching it exactly while matching the keys loosely leaves the widening hole open one level up — a decorated heading makes the whole declaration evaporate into `default`, with no halt and no warning. The comparison is an equality on the normalized text, not a prefix, so `## Process Profile Gate` remains a different section.

The section is **exactly one, at heading level 2, written as ATX**. The remaining shapes of the same hole HALT rather than resolving to `default`: a **second** `## Process Profile` section (only the first would be read, so the later declaration would take effect nowhere), a heading at **any other level** (`### Process Profile` is not this section, and being unmatched it would be reported nowhere either), and the **setext** form (`Process Profile` underlined with `---` or `===`) — legal CommonMark, but not the shape this reader accepts, so it too would be neither read nor reported. Appending a section is the likelier hand-edit precisely because the template already ships one that is present and empty.

Inside the section, **all three CommonMark code-block forms are examples, never declarations** — ```` ``` ````-fenced, `~~~`-fenced and four-space-indented. `~~~` is the standard way to nest a block that itself contains backticks, and a team documenting its own choice next to an alternative shape would otherwise either lose steps silently (the indented example silently BECOMING the profile) or be unable to run `/pair-next` at all, on an error naming a placeholder id it never configured. The indented form is the one ambiguous with real configuration, hence the HALT above: as an example it is skipped only when it carries no key line.

A fence closes on a run of the **same character, at least as long as the one that opened it** (CommonMark). Wrapping a **four-backtick** fence around a block that itself contains ```` ``` ```` is how a markdown example of a backticked declaration is shown at all — closing the outer fence on the inner one put that example back into declaration space, where it either became the profile or collided with the real declaration under a HALT naming a key the author wrote exactly once.

**HTML comments are not content either.** A `## Process Profile` section or a key parked in `<!-- ... -->` — the ordinary way to disable a markdown block without deleting it — is masked before anything is read, so a team trying a new profile while keeping the old one commented out is not told to "keep one section" about a file that visibly shows one.

**An UNTERMINATED fence or HTML comment HALTs the whole file.** Everything after the missing delimiter reads as non-content, so a section below it is not found at all — the profile resolves to `default` with nothing reported, and the report would have been the only sign the file was never read. A truncated view is not a view.

**Line endings are normalized before anything is read**: a CRLF way-of-working.md (the default checkout on Windows, `core.autocrlf=true`) resolves exactly as the LF one. Read literally, a CRLF file matched no key line and no heading line at all — every rule on this page went silent at once, and the file resolved to `default` with the whole process re-enabled.

**An absent `## Process Profile` section means `default`** — the full process, today's behaviour byte for byte. This is convention over configuration (D21): a project that runs everything configures nothing, and adding this feature changes no existing project's behaviour.

## Built-in Profiles

| Profile   | Enabled steps                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `default` | `*` — every step in the catalogue                                                                                     |
| `poc`     | `specify-prd`, `bootstrap`, `brainstorm`, `plan-stories`, `refine-story`, `plan-tasks`, `implement`, `review`          |

`poc` is the "we are proving something works" subset: **no DDD mapping** (`define-subdomains`, `define-bounded-contexts`) and **no strategic planning layer** (`plan-initiatives`, `plan-epics`) — stories come from discovery instead. It is a subset of the process, not a different one: the **guidelines still apply** to the code produced (testing, security, code design, the quality gates), because those are not steps and are not governed here.

`custom` names its own steps. It is not "a third built-in": it is the escape hatch for a subset neither built-in expresses.

## Error cases — all normative, none inferred

A profile misread does not surface as an error a user sees; it silently removes a step from every suggestion, which looks exactly like that step not being due yet. Every case below the reader cannot read therefore **HALTs** rather than narrowing quietly (the two it can read say so in their own row). A HALT resolves to **no step set at all**: stop and report — never continue on `default` (that re-enables the whole process) and never on an empty set (that disables it).

| Case                                        | Outcome                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Unknown profile name** (`profile: pocc`)  | **HALT**, listing the known profiles (`default`, `poc`, `custom`).                                              |
| **Unknown step id** in a whitelist          | **HALT**, listing the valid ids from the catalogue.                                                             |
| **A step id named MORE THAN ONCE** in a whitelist | **HALT**, naming the repeated id. Never deduped in silence: the same mistake HALTs one level up when it is the *key* that repeats, a repeat is as likely an edit never finished (the second name was to become a different step) as a harmless one, and unread it emitted the id's prerequisite warning twice byte for byte and made every "N steps enabled" count wrong. |
| **`custom` with no `whitelist` key**        | **HALT** — `custom` requires one. A *different* message from the row below: "you wrote none" is not "you wrote an empty one", and one message sends the reader hunting for a line their file does not have. |
| **Empty custom whitelist**                  | **HALT** — read as a **misconfiguration**, never as "everything disabled".                                      |
| **A key in a shape the reader rejects** (`- profile: poc`, value unbackticked) | **HALT**, restating the schema shape. Detection of the key is loose (bold, missing backticks); acceptance of the VALUE is strict — otherwise an unreadable line resolves to `default` and **widens** the profile to the whole process, silently. |
| **A key spelled in another CASE** (`` - `Profile`: `poc` ``) | **read as the key** — case is part of the key's *spelling*, so it is detected like every other decoration, and the canonical name is what the messages use. Not a HALT: the heading one line above is Title Case, so mirroring it into the key is the same author error as copying the table's bare spellings. Unread, `` - `Profile`: `poc` `` resolved to `default` with all twelve steps and nothing reported, and `` - `Whitelist`: … `` produced the "declares no `whitelist`" HALT about a line visibly in the file. |
| **A PARTIALLY backticked whitelist** (`` - `whitelist`: `implement`, review ``) | **HALT** — the whole line, not the readable half. Accepting the backticked ids and dropping the bare ones removes a step from every suggestion with **nothing reported**: the narrowing direction, which no user sees. Readability is decided on the RESIDUE — backticked spans and separators removed, anything left means the line is not readable. |
| **More than one value on a `profile` line** (`` - `profile`: `poc` (not `custom`) ``) | **HALT** — a profile is one name. Taking the first token silently discarded the rest of the line. |
| **The same key declared TWICE** in one section | **HALT**, naming the key. Only the last line was read, so the earlier declaration took effect nowhere — and the outcome was **order-dependent**: `custom` then `poc` resolved in silence, `poc` then `custom` tripped the built-in/whitelist HALT instead. |
| **A key on a marker the reader does not accept** (no bullet, or `1.` / `1)`) | **HALT**. Accepted markers are the three CommonMark bullets `-`, `*`, `+`; a numbered or bullet-less line carrying the key is a declaration the reader cannot honour, and reading it as prose resolves to `default`. |
| **A wrong marker AND an unbackticked value** (`1. profile: poc`) | **HALT** — the two errors compose, they do not cancel. Each axis HALTs alone, so a reader that required backticks behind a marker let their *intersection* through as prose, back to `default` and all twelve steps. Behind `1.` / `1)` the backticks are optional, because the marker is already the signal they stand in for; on a line with **no marker at all** they stay required, and `profile: poc` is prose. |
| **A key inside a BLOCKQUOTE** (`` > - `profile`: `poc` ``, `> - profile: poc`) | **HALT**. `>` is not indentation and no file here writes a blockquoted list item, so the line is a decorated declaration, not a quotation — read as prose it resolved the section to `default` with every step re-enabled. Backticks follow the marker rule above: optional behind the quoted `-` or `1.`, required for `` > `profile`: `poc` ``. A key in a documentation **table row** is the deliberate opposite: no declaration, and no HALT either. |
| **A value SPILLED past its line** (wrapped onto the next, or ending on a dangling `,`) | **HALT**. Read up to the wrap the line looks complete, so the ids after it are dropped from every suggestion with **nothing reported** — the narrowing direction. A long `custom` whitelist plus an 80-column lint rule makes wrapping the natural edit, so this is the likeliest of all these mistakes. |
| **A key INDENTED by four spaces or a tab**   | **HALT**. Indented code block or sublist item — the line does not say which, and skipping it re-enabled every step in silence while two spaces of indent read as a declaration. Ambiguous resolves to a HALT, never to `default`. |
| **An UNTERMINATED fence or HTML comment** anywhere in the file | **HALT**. Everything after it reads as non-content, so a `## Process Profile` section below it is not found at all — and nothing else would report that the file was never read. |
| **`whitelist` under `default` / `poc`**     | **HALT** — a built-in carries its own set, so the whitelist would be silently ignored.                          |
| **`whitelist` with no `profile`**           | **HALT** — a whitelist only applies to `profile: custom`.                                                        |
| **The section declared MORE THAN ONCE**     | **HALT** — keep one section. Only the first is read, so a profile declared in a later one takes effect nowhere, silently. The template already ships an empty `## Process Profile` section, so *appending* a second is the likelier edit. |
| **The heading at any level other than `##`** (`### Process Profile`) | **HALT**, restating the level. At another level it is not this section at all — and, being unmatched, it would otherwise be reported nowhere. |
| **The heading written as SETEXT** (`Process Profile` underlined with `---` / `===`) | **HALT**, restating `## Process Profile`. Legal CommonMark, not a shape this reader accepts — and, like the mis-levelled one, silent in both directions unless reported. |
| **Enabled step, all prerequisites disabled** | **Reported, not fatal**: flag the inconsistency with the **minimal fix**, never silently repaired.              |

The first two are deliberately **two different messages**. A typo in a step id and a profile name that does not exist are **not the same mistake** — one is "you meant a step that exists", the other is "you meant a profile that does not" — and a single generic message would send the reader looking in the wrong file.

Two rows do not HALT, and differently: a case-variant key is simply **read** (nothing to report — the declaration is honoured), while the last row is **read and reported**, because the configuration is readable but inconsistent, e.g.

```text
`plan-stories` is enabled but none of its prerequisites are — minimal fix: enable
`plan-epics` or `brainstorm`, or drop `plan-stories`
```

Prerequisites are an **any-of** ([why](step-catalogue.md#why-requires-is-an-any-of)): satisfied when at least one listed step is enabled.

## Who reads the profile

| Reader                                | What it does with it                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/pair-next`                               | Never proposes a disabled step; reports the HALTs above and the prerequisite inconsistency.                             |
| A step skill invoked **directly**     | Warns and asks for confirmation before proceeding — the [process-profile gate](skill-conventions/process-profile-gate.md). |
| A step skill reached by **composition** | Nothing to ask: it degrades exactly as a skill that is **not installed**. See the same convention.                      |
| A human following the **how-to** path | Reads the same profile: the catalogue maps each step to its how-to guide, so a project with **no skills installed** is governed identically (there is no second configuration for the manual path). |

The profile is **re-read every run**, never cached — an edit to `way-of-working.md` takes effect on the next invocation.

## Out of scope

Selecting a profile through a `/pair-next` argument is a **future extension**. Today the profile is a property of the project, declared once in adoption, not a per-invocation switch.
