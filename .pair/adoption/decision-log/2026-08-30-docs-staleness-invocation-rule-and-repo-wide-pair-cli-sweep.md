# Decision: the staleness gate reads the BINARY, and the `pair-cli` rename follows the gate's reach, not the file list

## Date

2026-08-30

## Status

Active

## Category

Convention Adoption

## Context

ADL [2026-08-25-cli-invocation-canonical-name-is-pair-cli.md](2026-08-25-cli-invocation-canonical-name-is-pair-cli.md) settled the name (`pair-cli`, no alias) and scoped the sweep from the evidence available at refinement: ten `metadata.ts` files, `reference/cli/{examples,workflows}.mdx`, `DEVELOPMENT.md`. Implementing story #449 turned the gate on and the scope did not survive contact:

1. **The real reach is 32 docs pages, not 2.** With the widened rule, `pnpm docs:staleness` sees **310 bare `pair <cmd>` invocations across 28 published docs pages** — `reference/cli/commands.mdx` (81) and `reference/cli/update-link.mdx` (36) alone outweigh the two pages the ADL enumerated, and `customization/`, `integrations/`, `migrations/`, `concepts/`, `contributing/`, `tutorials/` all carry more. Refinement's list came from grepping two files; the gate greps all of them. The story's Definition of Done requires `pnpm docs:staleness` green, so the file list is not a choice: the gate defines the scope.
2. **Bare `pair` cannot be matched with the same shape as `pair-cli`.** `pair` is also the product's name and appears in prose on nearly every page, so widening `INVOCATION_PREFIX` naively turns the gate into a false-positive generator. Two distinct sources of noise showed up immediately, each needing a rule, not an allow-list (the previous `PROSE_WORDS` list was deleted for exactly that reason).
3. **A latent bug in the existing rule surfaced.** The span rule's leading `\s*` crosses newlines, and a CLOSING FENCE ends with a backtick — so `` ``` `` followed by a paragraph opening with "pair creates Markdown files" matched as an invocation of `creates`. Harmless while only `pair-cli` matched (paragraphs rarely open with it); 8 hard failures the moment bare `pair` counted.

## Decision

**The invocation rule captures the binary and judges it; the rename sweep follows wherever that rule reaches.**

1. `INVOCATION_PREFIX` captures the binary — `(pair-cli|pair)` — instead of pinning the literal `pair-cli`. A bare `pair <cmd>` is reported as its own error (wrong binary), **once**, and is never also reported as an unknown command. `PUBLISHED_BIN` is the single place the canonical name is written.
2. **The separator between binary and command is ONE space, not `\s+`.** A run of aligned whitespace is a diagram column, never an invocation — the four PM-tool pages map their hierarchy under a fenced heading (`pair                    Linear`), which `\s+` reads as "run `pair Linear`". This is a positional rule in the same spirit as the existing one, not a per-page exception.
3. **The span rule allows only horizontal whitespace after the opening backtick** (`` ` ``+`[ \t]*`), so a closing fence can no longer reach into the paragraph below.
4. **Scope = every surface that documents or prints an invocation**, which is the ADL's own business rule ("no dual naming") applied honestly: all 11 command `metadata.ts` files (the ten enumerated **plus `run`**, added by #451 after refinement), every `pair-cli` printed hint/usage/error string in `apps/pair-cli/src` and in the `scaffold-kb` templates it generates into a user's KB repo, the `pair-cli update` regenerate hints printed by `packages/knowledge-hub`'s mirror tools, all 28 docs pages, and `DEVELOPMENT.md`.

Deliberately **out** of scope, and left bare: `scripts/smoke-tests/**` (`run_pair` is a shell function, not the binary), `.github/workflows/*.yml` step *names*, and `qa/release-validation/*.md` *headings* — none is an instruction a reader executes (those docs invoke `$CLI`), and none is reachable by any gate.

## Alternatives Considered

- **Keep the sweep to the ADL's file list and narrow the gate to those files**: rejected. A gate that only looks where the drift has already been fixed cannot catch the next regression — the exact failure mode this story exists to close.
- **Restrict the bare-`pair` command token to lowercase** (`[a-z]…`) to exclude `pair Linear` / `pair Filesystem`: rejected as the discriminator. It happens to work on today's four diagrams because their next word is capitalized, but the property that makes them diagrams is the *alignment*, not the capitalization; the single-space rule states the real reason and stays true for a lowercase diagram label.
- **Fix the PM-tool diagrams instead of the rule** (re-indent so `pair` is not at line start): rejected — bending documentation to a regex, and the rule would still be wrong for the next diagram.
- **Also rename bare `pair <cmd>` inside `apps/pair-cli` source comments only, leaving strings**: rejected as a half-measure — the comments describe the same invocations, and a mixed convention is what let the drift start.

## Consequences

- The diff is ~330 doc/string occurrences across 4 workspaces (`apps/website`, `apps/pair-cli`, `packages/knowledge-hub`, root `DEVELOPMENT.md`) instead of the ~15 files the ADL predicted — mechanical, no behavior change, but wider than the refinement estimate. The story's `risk:yellow` (carried by Change/diff risk) is unchanged in kind: still multi-module, still a string rename.
- Two existing assertions in `packages/knowledge-hub` (`mirror-guard.test.ts`, `skill-md-mirror.test.ts`) pin the printed regenerate hint and were updated to the new string — assertion text only, no behavior change.
- The gate now fails on a bare `pair <cmd>` in any published docs page, so a regression back to the wrong name is caught at CI, not by a reader whose copy-paste fails.
- `AC3`'s seven `pair kb validate` (hyphen-less) occurrences and `AC5`'s `organization.mdx` occurrence were already resolved before this story started — verified zero repo-wide; nothing to change for either.

## Adoption Impact

- `.pair/adoption/tech/infrastructure.md` — the existing canonical-name line gains the enforcement fact: the name is now checked by the website's `docs:staleness` gate, which errors on a bare `pair <cmd>`. Cross-references this ADL.
- No change to `tech-stack.md` or `way-of-working.md` — no new tool, no new process; the gate already existed and already ran in CI.
