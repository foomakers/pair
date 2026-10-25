# @pair/website

## 0.5.2

### Patch Changes

- [#570](https://github.com/foomakers/pair/pull/570) [`80f5788`](https://github.com/foomakers/pair/commit/80f57888658cd646ecc5e69885dd52d063a84b35) Thanks [@rucka](https://github.com/rucka)! - What's new rewritten benefit-first with a one-line explanation of every term and a single link per item; CHANGELOGs released with v0.5.1 no longer mention 0.5.0 ([#562](https://github.com/foomakers/pair/issues/562)).

- [#569](https://github.com/foomakers/pair/pull/569) [`8b3a54e`](https://github.com/foomakers/pair/commit/8b3a54e01c22883072340c500d97b3926d8c54ba) Thanks [@rucka](https://github.com/rucka)! - Release flakes and v0.5 validation defects: `tokens.pipe` test no longer spawns the CLI in a hook, website `ts:check` runs after the build that regenerates `.source`, `run --dry-run --profile <unknown>` halts for `--card` and `--root`, 404 message keeps hyphenated prerelease ids, invalid project config prints the error prefix once, `pair-cli --help | head` exits quietly on EPIPE, docs sidebar separator renders, `package` skips the markdown parse for link-free files, `/pair-assistant` states how to opt back in after a skipped registry and names every installed path.

  Release with `--version X.Y.Z`: CHANGELOG headings and `@pair/*` dependency lines now carry X.Y.Z, like every `package.json` (`changelog-version` step in `version.yml`).

  `install --source <github.com URL>` that is not the official release no longer announces the CLI version in the download line.

- [`b167de2`](https://github.com/foomakers/pair/commit/b167de27a9c33a9b0bfd9c026c619ba6b855c56b) Thanks [@rucka](https://github.com/rucka)! - `pair-cli run` shows live per-card progress: on a terminal each card keeps one line rewritten in place (id, title, stage `prepare` → `implement` → `review` → `fix N/max` → `merge`, PR, elapsed, then `✔ merged` / `⏸ awaiting-human` / `⚠ escalated` / `✖ failed` / `? unknown` when the engine returned no readable card status), with one row per card under `--parallel`. A finished card's line is printed once above the live rows, which show only running cards and never grow past the terminal height. Without a terminal you get one timestamped line per event. `--json` prints the events as NDJSON, `--quiet` gives back the old output, `--no-color` and `NO_COLOR` turn colors off.

  The audit file is written live: a `loop-start` line before the first selection, then one JSON line per event, so you can `tail -f` it and a killed run keeps its trail. The banner prints the absolute audit path; the end summary lists cards merged / parked / failed / unknown and how many eligible cards are left.

  The run outcome is now truthful: a workflow HALT, a background workflow cut before it finished, or an idle timeout exits non-zero instead of reporting `success`. A run is stopped only after 30 minutes with no engine event (`--idle-timeout`, `## Stop Predicate` `idle-timeout:`, `pair.config.json` `engine.idleTimeout`); `--iteration-timeout` becomes an opt-in total cap with no default. Both timeouts accept at most 2147483 seconds. `claude` runs with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.

  With the `claude` engine, live stages come from the stage agents of Claude Code's `task_progress` events: a background workflow's log lines never reach `claude -p` output.

  Also in this release:
  - One live row per card for the whole run, `--card` included: the preparation flows into the cycle on the same row, a finished card keeps it and a re-driven card reuses it; the row shows the current step in plain words (`writing tests · try 2`, `coding · <task>`, `reviewing · round 2`, `waiting for CI`) and the PR number once known.
  - A quiet terminal: the driver's technical lines, child output and the loop banner move to the audit and the new `--verbose` flag; a card's notes become its row's detail, never a new line.
  - The loop shows one status row: `Checking for cards (…)…` while it selects, `Waiting for new cards — next check in 10m` while idle.
  - The loop drives each card's cycle in its own process (no nested `pair-cli run`); a card never draws a second live block, its stderr is relayed like stdout, and rows are drawn with auto-wrap off so a wide row is clipped, never duplicated.

- [`9502db6`](https://github.com/foomakers/pair/commit/9502db600aec74adf02fe15fe7b557d0503f08aa) Thanks [@rucka](https://github.com/rucka)! - `pair run` recovers instead of parking or exiting ([#575](https://github.com/foomakers/pair/issues/575)): a merge-time tier gate that comes back red is re-run once on the same reviewed head after `worktree-setup-command`, then routed to the fix stage with the failing gates as findings (or parked `needs-human` once `maxFixRounds` is spent); a durable failure recorded on a PR or base head that has since moved is stale and retried; a review on a head that is no longer the PR head is re-verified; a branch that conflicts with its base is synced mechanically (`Pair-Base-Sync` trailer, checked by custody; a generated mirror takes the side its dataset source took); a failed CI run is re-run once; prerequisites are read deterministically through the PM adapter (`blocked by #<id> (<reason>)`, fail closed; only an issue closed as completed counts as merged). Budgets `autoRecoveryRounds` (default 5) and `maxFixRounds` (default 10, was 3) are `## Autonomy` keys; a spent budget parks the card `needs-human: <reason>` and the run continues; a new run lists earlier exclusions and re-evaluates them.

  Also in this release:
  - CI still red after its re-run goes to the fix stage with the failing checks and their log tail as findings.
  - A preparation refused for a dirty story worktree stashes the stray files (`pair-recovery: …`, kept) and retries; a validation stopped with `seal-not-pushed` is dispatched again; the seal push is no longer killed by a pre-push hook printing over 1 MB.
  - `autoRecoveryRounds` counts only the rounds since the last step that advanced; a durable failure (`failed-preparation`, `failed-contract`…) is driven again once the base or the PR head moved.
  - A GREEN that a gate rejects on a path outside its fixScope reports `contractGaps`; `resolve` routes a revision of the group's contract that may widen the scope by exactly those paths.
  - `implement-phase` resumes the story's own uncommitted work left by an interrupted attempt instead of stopping on it.
  - Generated mirrors are never a contract gap: custody judges a mirror byte-identical to its dataset file by its origin, and `pnpm mirrors:regenerate` also copies the workflow suites into `.claude/workflows/`.

- Updated dependencies []:
  - @pair/brand@0.5.2

## 0.5.1

### Patch Changes

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - `/pair-assistant` is now also pair's configuration guide ([#552](https://github.com/foomakers/pair/issues/552)):
  - Capability menu, `kb-cache` and `tokens` rows, and a Configure step that routes each configuration area (autonomy, cycle hooks, blocking severities, workflow profiles, `skipRegistries`, adoption files) to its owner, shows the diff, validates with the installed cycle scripts and writes through record-decision.
  - Docs: new pages `reference/pair-assistant`, `reference/adoption-settings`, `concepts/delivery-workflow`, `developer-journey/lifecycle-modes`; optional marketplace quickstart; "With the CLI / With `/pair-assistant`" pairs; five new diagrams; `docs:staleness` now checks the "Via" line per command and every internal `#anchor`.

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Docs information architecture, per the clean-context IA review ([#552](https://github.com/foomakers/pair/issues/552)):
  - Process Lifecycle moves to the `process-lifecycle` slug as a five-part spine: overview, `phases/` (induction, strategic planning, iteration, execution), analysis and refinement workflow, delivery workflow with the delivery cycle in depth beneath it, lifecycle modes with a mode-by-assistant matrix, skill layers, tag-driven automation. Every spine and concept page ends with a Next link.
  - Three labels everywhere a step names its path: "In your assistant" (skills), "With pair-cli" (real commands), "With `/pair-assistant` (optional, Claude Code)".
  - The five stapled guides are recipes again; their tails are `reference/cli/install-sources`, `reference/cli/update-link`, `tutorials/release-testing`, `tutorials/share-ai-artifacts` and `getting-started/verify`.
  - Customization is dissolved into Guides (`customize-for-your-team`, `customize-templates`, `monorepo-rules`, one `external-kb` guide with `scaffold-kb` plus the generated release script as the default channel), Reference (`templates-catalog`) and Concepts (`package-local-adoption`). The three role quickstarts merge into `getting-started/choose-your-path`; the quickstart is install and first run only.
  - New `concepts/glossary`; `concepts/index` lists every page in groups; `reference/cli/workflows` merges into `cli/examples`; the batch engine page moves to Contributing as "Batch engine internals".
  - Contradictions fixed: fresh-card stage order, `Ready` instead of `Refined`, `## Autonomy` as the canonical automation vocabulary with `## Eligibility` and `## Auto-Advance` documented as legacy, Windows support stated once (WSL2 or Git Bash).
  - Captions say what to notice; the lifecycle diagram opens the hub and Getting Started. Redirects for every moved page; `lib/docs-ia.test.ts` guards the structure.

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Guides, What's new, text cleanup ([#552](https://github.com/foomakers/pair/issues/552), increment 5b):
  - New top-level `guides` section (20 task guides plus index) after Tutorials; new `whats-new` page after Welcome.
  - Absorbed pages moved with redirects: `reference/cli/update-link`, `customization/install-from-url`, `tutorials/managing-ai-artifacts`, `tutorials/release-testing`, `getting-started/checklist`.
  - No em dash in docs content (`docs:staleness` fails on U+2014); text walls split; diagrams captioned.

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Process Lifecycle docs ([#552](https://github.com/foomakers/pair/issues/552), increment 5a):
  - Nav: Process Lifecycle after Getting Started, new overview and `lifecycle-overview.svg`.
  - New pages: `developer-journey/refinement-workflow`, `developer-journey/skill-layers`, `tutorials/brainstorming`, `tutorials/refinement`, `pm-tools/custom`.
  - Moved with redirects: `concepts/delivery-workflow` to `developer-journey/delivery-workflow`; `tutorials/unattended-delivery` to `tutorials/automated-development`.
  - Lifecycle modes cover both workflows; quickstart and Getting Started put the CLI/plugin install choice first; v0.4 to v0.5 migration audited.

- [`aa2b884`](https://github.com/foomakers/pair/commit/aa2b88418ec1355bda7e5121b02cf578bc84f4b1) Thanks [@rucka](https://github.com/rucka)! - Release validation CP1-CP12 listed in `contributing/release-process` (pair repo docs; `tutorials/release-testing` stays framework-level). `docs-staleness-check` memoizes the MDX compile and heading parse per page content, so repeated `runAllChecks` calls in one vitest worker no longer re-parse the whole docs tree (cold ~1.4 s, warm ~0.2 s): fixes the `[vitest-worker]: Timeout calling "onTaskUpdate"` caused by multi-second synchronous blocks.

- [`f664ffa`](https://github.com/foomakers/pair/commit/f664ffa3a6bd4b8354c3465ddea1b58936881d75) Thanks [@rucka](https://github.com/rucka)! - Landing page restructured for v0.5: hero sub-head on the lifecycle and the three modes with the install command inline, What's new banner, pain points reworded around process ownership and independent verification, Works with lists pi and opencode with the two-tier harness line, How it works replaced by the process lifecycle (four phases, `lifecycle-overview.svg`), new Three modes, Delivery workflow and Risk tiers sections, audience tracks rerouted to Quickstart, Team path and External KB, demo poster re-cut from a terminal frame, no em dashes in copy or metadata. README first install command aligned to `npm install -g @foomakers/pair-cli`.

- [#567](https://github.com/foomakers/pair/pull/567) [`539f8a1`](https://github.com/foomakers/pair/commit/539f8a1b90b906f39011bc384d73c57f39020a68) Thanks [@rucka](https://github.com/rucka)! - Release references set to v0.5.1: landing banner, `docs/whats-new`, `docs/index`, CP1 MT-CP114 ([#562](https://github.com/foomakers/pair/issues/562)).

- Updated dependencies []:
  - @pair/brand@0.5.1

## 0.4.3

### Patch Changes

- @pair/brand@0.4.3

## 0.4.2

### Patch Changes

- @pair/brand@0.4.2

## 0.4.1

### Patch Changes

- c53b8cf: Release v0.4.1 — Website, Docs & Brand Identity

  ### Website
  - **Landing page** with brand identity, demo video, and accessible design
  - **Full-text search** powered by Orama (client-side, zero external deps)
  - **Vercel hosting** with automatic preview deploys on PRs

  ### Documentation
  - **Getting Started** guides for solo devs, teams, and organizations
  - **4 tutorials**: first project, existing project, team setup, enterprise adoption
  - **6 how-to guides**: CLI workflows, install from URL, customize KB, adopter checklist, troubleshooting, update links
  - **Reference**: CLI commands, 31 skills catalog, KB structure, configuration
  - **Customization**: how to adopt pair, customize templates, scale to teams and orgs
  - **Developer Journey**: step-by-step from induction to execution
  - **Integrations**: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf
  - **PM Tools**: Filesystem, GitHub Projects, Linear
  - **Contributing**: dev setup, architecture, skills authoring, KB guidelines, release process
  - **FAQ**: 22 answers across 6 categories

  ### CLI
  - **llms.txt support**: auto-generates `.pair/llms.txt` on install/update; website serves `/llms.txt` and `/llms-full.txt` for LLM-friendly discovery
  - **New branding**: pair logo and tagline shown on every CLI command

  ### Fixes
  - Search now works correctly on all docs pages
  - Navigation no longer loops on section index pages

- Updated dependencies [c53b8cf]
  - @pair/brand@0.4.1
