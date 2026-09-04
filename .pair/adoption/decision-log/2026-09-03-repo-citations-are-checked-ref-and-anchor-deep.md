# Decision: a repo citation is checked ref-deep and anchor-deep, not just path-deep

## Date

2026-09-03

## Status

Active

## Category

Convention Adoption

## Context

The docs site cites repo files by GitHub URL (`https://github.com/foomakers/pair/blob/main/<path>`). Check 5b (`findDeadRepoLinks` in `apps/website/lib/docs-staleness-check.ts`, run by `pnpm --filter website docs:staleness`) resolved the **path** and nothing else, in two directions:

- **Ref pinned to `main` in the regex.** A citation under any other ref matched nothing and shipped unchecked. `blob/mian/README.md` (a one-letter typo) and `blob/master/…` (this repo has no `master`) are 404s for every reader that the gate reported as PASS.
- **Fragment stripped and discarded.** Three shipped citations carry one (`skills-guide.md#callers-matrix-scoped-capabilities`, `quality-model.md#6-techrisk-matrixmd--adoption-delta`, `CP10-web-cloud-environment.md#execution-log`). Renaming a cited heading drops every reader at the top of a 200-line file while `docs:staleness` still prints PASS — the same "a repo citation nothing checks" gap Check 5b was written to close, one delimiter further in.

## Decision

Check 5b resolves the whole citation.

**Ref** — captured, then decided per ref:

| ref | verdict |
| --- | --- |
| `main` | resolve the path (and the fragment) against the working tree |
| immutable permalink — 7-40 hex sha, or `v?N(.N)*` tag | **skip**: it is pinned on purpose and may legitimately name a file `main` no longer has |
| anything else (`master`, `develop`, `mian`) | **error** — `use main/ (or an immutable sha/tag permalink)` |

**Fragment** — validated only where a fragment means a heading: `kind === blob` **and** the path ends `.md`/`.mdx`. `tree/` is a directory listing and `raw/` serves bytes, so a fragment on either is skipped; so is GitHub's own line anchor (`#L203`, `#L203C5-L210C9`). Otherwise the file's headings are slugged and the fragment must be among them.

**The slug rule is github.com's, taken from github.com — and github.com is the ONLY oracle for it.** Inline markup is reduced to rendered text first (a `[Templates](templates/README.md)` heading anchors as `#templates`, not `#templatestemplatesreadmemd`), then: lowercase, drop every character outside the KEEP set, U+0020 to `-`, repeats disambiguated by a **skip-until-free loop** — `${base}-${n}` with `n` climbing until it names a slug no earlier heading took, which is not the same as a per-base occurrence counter (`## Foo`, `## Foo 1`, `## Foo`, `## Foo` → `foo`, `foo-1`, `foo-2`, `foo-3`, where a counter computes `foo-2` for the last heading and never emits `foo-3`; probed on `gh api -X POST /markdown`). Only slugs the loop itself generated participate — an explicit `<a name>` is separate HTML github.com's slugger never consults. Every row of the unit table is what `gh api -X POST /markdown -f text='## <heading>'` returns for that heading — including the ones that are wrong by inspection (`_italic_` slugs as `italic`, `snake_case` keeps its underscore).

The KEEP set is **Ruby's `\p{Word}` plus `-` and U+0020** — github's markdown pipeline is Ruby — i.e. `Alphabetic | Mark | Nd | Connector_Punctuation | Join_Control`, spelled `[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}\- ]` in JS. It is NOT "letters and digits", and the difference is invisible by inspection in three classes, each of which was a wrong anchor on real repo files:

| class | github.com | evidence |
| --- | --- | --- |
| `\p{M}` (Mn/Mc/Me) | **keep** | 278 variation selectors ride 276 repo headings. `CLAUDE.md`'s `## 🛠️ Essential Commands` is `#️-essential-commands` — U+1F6E0 dropped, U+FE0F **leading the slug** |
| `\p{Join_Control}` (ZWJ/ZWNJ) | **keep** | `secure-development.md`'s `👨‍💻 **SECURE CODING STANDARDS**` is `#‍-secure-coding-standards`; every other `Cf` (soft hyphen, RLM, ZWSP, BOM) is dropped |
| `\p{Nl}` vs `\p{No}` | **split** | `Ⅸ` survives (Alphabetic covers Nl), `①` and `½` do not — `\p{N}` keeps both |

**`github-slugger` is not the oracle, despite the shape being the same.** v2.0.0 DROPS U+200D where github.com keeps it, so mirroring the package would have reproduced the ZWJ bug. Probed over 56 category rows, `\p{Word}`+`-`+space matches github.com on 56/56 where `[^\p{L}\p{N}_\- ]` misses 16 and "letters/digits/marks/ZWJ" still misses the 4 `No` rows.

Three URL spellings that were false-positive **build breaks** are fixed in the same pass: `<` / `>` are excluded from the path character class (a CommonMark autolink `<…/README.md>` used to capture `README.md>`), and **both** the path and the `#fragment` are `decodeURIComponent`'d before they are resolved, each with its own literal fallback (`docs/my%20file.md` is the file `docs/my file.md`; `#option-c--full-di%C3%A1taxis-re-org-heavier` is the anchor github.com puts in the address bar for `#option-c--full-diátaxis-re-org-heavier`; a malformed escape resolves literally rather than throwing). Decoding a fragment is unambiguous because `%` is not in the KEEP set, so it can never be part of a real slug.

## Alternatives Considered

- **Document the `main`-only scope in a comment and leave the ref pinned**: the cheaper half of the review's recommendation, but it leaves `blob/mian/…` shipping as an unchecked 404 — a comment does not fail a build.
- **Error on every non-`main` ref, permalinks included**: closes the typo hole and simultaneously breaks the build on the one legitimate non-`main` citation form. A permalink names an immutable ref precisely because the file may be gone from `main`; the working tree cannot answer for it.
- **Depend on `github-slugger`**: it is neither correct by construction (v2.0.0 disagrees with github.com on U+200D) nor free — a new runtime dependency in `apps/website` for ~10 lines, still needing the rendered-text reduction on top. Mirrored, and pinned to github's own renderer by test instead.
- **Validate line anchors (`#L203`) too**: a moved line is undetectable and an out-of-range one still renders. No signal, real false-positive risk.

## Consequences

- A docs citation must be spelled `blob|tree|raw/main/<path>` or use an immutable sha/tag permalink; any other ref fails `docs:staleness`.
- Renaming a heading that a docs page cites is now a build break in `docs:staleness`, not a silent reader-facing regression — the citation and the heading move together or CI says so.
- The slug mirror must stay honest, and the table is what keeps it so: `slugifyHeading`'s unit table has **one row per cell of the KEEP set** — Mn, Mc, Me, ZWJ, ZWNJ, non-Join_Control `Cf`, Nl, Nd, No, the `Lm`/`Sk` look-alike pair (`ˆ` U+02C6 is `Lm`, a modifier LETTER, so Alphabetic keeps it; U+1F3FD is `Sk` and drops), non-U+0020 spaces — because a single well-behaved emoji row (`🚀`, no variation selector) passed green while 276 repo headings were slugged wrong. If github changes its anchor rule, re-probe those rows with `gh api -X POST /markdown -f text='## <heading>'`, never `github-slugger`.
- A dead-anchor diagnostic must be **losslessly readable**: every code point outside printable ASCII is rendered `\u{XXXX}` (a literal backslash doubled), and the nearest headings — Levenshtein ≤ 3 over code points, at most 3, nearest-then-lexicographic — are offered as `did you mean #…?`. Raw, `CLAUDE.md#-essential-commands` (dead) and `CLAUDE.md#️-essential-commands` (live) print IDENTICALLY, so a red build reads as a false positive and the developer deletes a working fragment.
- Repo-scale check, when in doubt: set-diff `collectHeadingSlugs` against github.com's own rendered blob HTML (`gh api repos/foomakers/pair/contents/<path> -H 'Accept: application/vnd.github.html'`, `href="#…"`). Across 12 mark-bearing repo files that is 328 anchors, 0 missing / 0 extra.

## Adoption Impact

- `adoption/tech/way-of-working.md` § Quality Gates — the existing "Link gates resolve targets case-sensitively" bullet gains the ref/anchor depth of Check 5b, so the documented gate matches what it enforces.
