# Decision: kb-validate's optional-link globs are matched by an internal matcher, not a new runtime dependency

## Date

2026-08-19

## Status

Active

## Category

Library Choice

## Context

Story #188 gives `pair kb-validate` declarative optional link patterns
(`link_validation.optional_link_patterns` + `--optional-link-patterns`), so a KB validated in
isolation stops failing on relative links into a codebase that is not checked out beside it.
That requires glob matching, which the CLI did not have: registry `include` entries are folder
prefixes compared with `startsWith`, not globs, so there was nothing to reuse.

The story's technical analysis proposed `picomatch` or `minimatch` and left the choice to
implementation. `@pair/pair-cli` is **published to npm** (`apps/pair-cli/package.json`,
`publishConfig.access: public`) and today ships six runtime dependencies, none of them a
transitive-heavy utility; every dependency added here is installed by every consumer of the
CLI and is a supply-chain surface the project has to track. The matching surface actually
needed is small and fixed: `**`, `*`, `?`, `[abc]`, anchored, on short POSIX path strings —
no brace expansion, no extglob, no `!` negation, no filesystem walking (the walking is
already done by the registry layer; the patterns only classify a path string).

## Decision

Optional-link glob matching is implemented **inside the CLI**, in
`apps/pair-cli/src/commands/kb-validate/glob-match.ts` (~160 LOC plus comments, white-box
unit-tested in `glob-match.test.ts`), and **no glob library is added to the tech stack**.

The module compiles each pattern to segments of tokens and matches them with a two-pointer
wildcard algorithm — **not** a `RegExp`. Compiling to a regex was the first implementation and
was rejected on review evidence: `[z-a]` (range out of order) makes `new RegExp` THROW, and
adjacent `.*` groups backtrack catastrophically (`**a**a**a**b` against a 65-character path did
not finish in two minutes). Both failure modes are structural, not input-validation gaps, and
both abort a run the feature exists to keep alive. The two-pointer matcher cannot throw and is
O(n·m); patterns it cannot compile — blank, unterminated character class, out-of-order range —
are reported to the caller instead, so a config typo degrades to a warning rather than aborting
the run (and is warned about under `--strict` too, where the matchers are discarded but the
diagnostic still matters, CI being where `--strict` runs).

Two consequences of "internal, therefore ours to define" are decided here as well:

- **A pattern is matched against two forms of the same link** — as written in the markdown
  (`../../apps/x.ts`) and resolved relative to the KB root (`apps/x.ts`) — because both are how
  a maintainer legitimately expresses the rule, and the written form's `../` depth varies with
  the source file's depth while the resolved form does not. First match wins, so overlapping
  patterns still produce exactly one warning.
- **Matching is pure string work.** Nothing in the matcher touches the filesystem, so an
  optional pattern can never widen what `kb-validate` reads outside the KB root.

## Alternatives Considered

- **Add `picomatch` (or `minimatch`) as a runtime dependency**: rejected for now. It buys
  brace expansion and extglob that this feature does not use, on a published CLI whose
  dependency list is deliberately short; the pnpm catalog would gain an entry, and every
  consumer a transitive install, to replace ~160 lines with fully specified behavior. The
  matcher's API (`compileOptionalLinkPatterns` / `matchesAnyPattern`) is the seam: if a second
  or third consumer needs real glob semantics, swapping the implementation behind it is a
  contained change, and this decision is revisited then.
- **Simple prefix matching (`startsWith`), as the story allowed for an MVP**: rejected. The
  configured value would look like a glob (`../../apps/**`) but behave like a prefix, and
  `apps/*` vs `apps/**` — the one distinction users will reach for first — would be
  indistinguishable. A syntax that lies about itself is worse than either real option.
- **`path.matchesGlob` from Node**: rejected. Experimental at the project's supported Node
  range, so it would pin the CLI's minimum runtime to an unstable API.

## Consequences

- No change to `tech-stack.md`: this story adds no dependency.
- `glob-match.ts` is production code with its own unit tests; the supported syntax is documented
  in the module header and in the CLI reference (`kb-validate` → Optional link patterns), and the
  docs state the anchoring and the two matched forms so behavior is not inferred from source.
- Unsupported constructs (`{a,b}`, extglob) are matched **literally** rather than rejected. A user
  who writes them gets no match rather than an error; the documented syntax list is the contract.
- `**` matches **zero or more** segments when it is a whole segment (`a/**/b` matches `a/b`,
  `**/apps/**` matches `apps/x.ts`, `apps/**` matches `apps` itself), and means `*` when it is not
  (`a**b` cannot cross `/`).
- **This is NOT minimatch parity** — do not transfer minimatch habits wholesale. Measured against
  `minimatch@10.1.2` over a 20 × 20 pattern/candidate grid, every divergence found was MORE
  permissive than minimatch, in three families:
  1. a trailing `/**` also matches the **directory itself** (`apps/**` ∋ `apps`, `**/b/**` ∋ `b`,
     `a/b`, `a/x/b`, `a/x/y/b`) — deliberate, pinned by `glob-match.test.ts`, and the reason
     `apps/**` reads as "anything under apps, apps included";
  2. `**` **traverses `..` segments** (`**`, `**/apps/**`, `**/x.ts` all match `../../apps/x.ts`),
     which minimatch's globstar refuses — and `..` is exactly the shape these patterns are written
     for, since the links this feature tolerates point out of the KB;
  3. a trailing empty segment matches a wildcard (`apps/*` ∋ `apps/`) — irrelevant here, link
     targets are files.
  All three point the same, riskier way for a feature whose job is downgrading errors to warnings:
  a maintainer assuming minimatch writes a BROADER rule than intended and can silence a genuinely
  broken link, with no diagnostic (a too-broad pattern is not "malformed"). Families 1 and 2 are
  stated in the CLI reference's syntax list, which is the contract.
- Matching cost is bounded by construction (two-pointer, single backtrack anchor at each level),
  so no pattern an operator can write can hang `kb-validate` in CI.
- A future need for full glob semantics elsewhere in the CLI is the trigger to revisit — the
  decision is "not yet", not "never".

## Adoption Impact

- No adoption file changes: the tech stack is unchanged and this is a scoped implementation
  choice, recorded so a reviewer does not re-litigate "why not picomatch" from the diff alone.
