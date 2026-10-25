# @pair/knowledge-hub

## 0.5.2

### Minor Changes

- [`e1707f9`](https://github.com/foomakers/pair/commit/e1707f937dc48eb140e08a083224a24d85551798) Thanks [@rucka](https://github.com/rucka)! - Contract-gap revision seals deterministically: `seal` derives `changedRows` from the diff (union), auto-reattests a witness unchanged at HEAD (`witness unchanged at head`), reclassifies a red witness already green at head as a control; `publish` runs the adopted `format-command` on artifacts and restamps their digests.

- [`6d53c19`](https://github.com/foomakers/pair/commit/6d53c192b26d9544acd94e1263dd9cae6bef63df) Thanks [@rucka](https://github.com/rucka)! - Linear PM adapter: with `pm-tool: linear` (and `code-host: github`) the delivery cycle and the unattended loop read and write Linear issues through its GraphQL API (`LINEAR_API_KEY`, `linear-team`, `## State Mapping`). Card ids are `ENG-123` or the issue URL. Labels resolve to the issue team's or a workspace label, never another team's.

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

- [`b85513c`](https://github.com/foomakers/pair/commit/b85513c30cec03f5c8a38e67aac77d17bb550222) Thanks [@rucka](https://github.com/rucka)! - Autonomy presets (`preset: full | escalate-red | supervised | custom`, `pair run --preset`), gate values renamed `hold-always | hold-never | hold-when` (bare forms deprecated aliases), `filter: *` for the whole backlog, `merge: hold-never` waives the red explicit approval, no `max-iterations` ⇒ the loop runs to a natural stop, `## Working Cleanup` sweep at `pair run` start, `.pair/working/` added to `.gitignore` on install/update, automation template + bootstrap preset step + `/pair-assistant` legacy migration.

  A `--preset` argument beats every adoption key (legacy `## Eligibility` / `## Auto-Advance` included); only an explicit argument key beats it. With no `--preset`, the adoption applies as declared.

  Also in this release:
  - `--parallel` is optional on the loop: `--watch`, `--preset`, `--until`, `--prepare`, `--merge` and `--predicate` with `--root`/`--filter` run one card at a time.
  - `--watch` stays on: an idle poll never spends the iteration cap (only an iteration that ran a card counts), so a loop waiting for new cards or for a human runs until Ctrl-C or the Stop Predicate.

### Patch Changes

- [`ea2ac5a`](https://github.com/foomakers/pair/commit/ea2ac5a098c721cb027af0a11dc5455b545600bf) Thanks [@rucka](https://github.com/rucka)! - [[#572](https://github.com/foomakers/pair/issues/572)] Unattended loop works with any adopted PM tool: `filesystem` PM adapter (state = folder + Status line, labels line, marker comments, worktree-committed writes, merge-time epic cascade); opaque card ids validated by the bound adapter's `parseCardRef`; card reads (`cycle-state.mjs card`, `whoami`) replace `gh issue` in batch prompts, pair-next and pair-cli.

- [`e64ab51`](https://github.com/foomakers/pair/commit/e64ab51bcf5fc90fb6c2729918edeb7659d93116) Thanks [@rucka](https://github.com/rucka)! - Review: one stale-docs finding lists every outdated location ([#582](https://github.com/foomakers/pair/issues/582)). The review-phase skill runs a stale-claim sweep (whole PR diff + repository docs, the specific claim, not the topic) before writing a documentation finding and lists every location in that one finding — a generated mirror as `<mirror> ← <dataset path>`, fixed at the source; a later hit joins the same finding id. `cycle-state.mjs` refuses a `doc` group whose `allowedPaths` miss a listed location (`finding-location-outside-scope: <id>: <path>`; a directory covers its children, a generated mirror is exempt only when its source is in scope), so the green fix covers every place in one round.

## 0.5.1

## 0.4.3

## 0.4.2

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

## 0.4.0

## 0.3.0

### Minor Changes

- ba651dd: Prepare release `0.3.0`.

  Highlights:
  - Install KB from URL, local ZIP, or local directory with resume support,
    progress reporting, and SHA256 validation.
  - Add `pair package` command to create validated KB ZIP packages with manifest
    and checksum generation for distribution.
  - Introduce `pair update-link` command to validate and convert KB links
    (relative/absolute) and provide CI-friendly dry-run and verbose modes.
  - Separate KB dataset release workflow and auto-download/cache manager
    for runtime KB consumption.
  - Multiple UX and reliability improvements: retry logic, TTY detection,
    streaming downloads, and improved error messages.
  - Minor fixes.

  This release is backward compatible and focuses on KB distribution and
  packaging features for adopters and teams managing private KBs.

## 0.2.0

### Minor Changes

- # Release v0.2.0 - Enhanced CLI Distribution & Documentation

  ## 🚀 New Features

  ### GitHub Packages Publishing Support (#20)
  - **CLI Distribution**: Added automated publishing to GitHub Packages registry
  - **Release Automation**: Complete CI/CD pipeline for packaging and publishing
  - **Package Validation**: Comprehensive smoke testing for published artifacts
  - **Token Authentication**: Proper GitHub Packages authentication and permissions

  ### Enhanced Knowledge Hub Organization (#35)
  - **3-Level Guidelines Structure**: Reorganized guidelines into infrastructure, quality-assurance, technical-standards, and user-experience
  - **Comprehensive Documentation**: Added detailed guidance across all technical areas
  - **Improved Navigation**: Updated internal links and documentation structure
  - **Quality Assurance**: Added PR QA checklist and audit reports

  ## 📚 Documentation & Support (#24)

  ### Complete Support Infrastructure
  - **Installation FAQ**: Categorized troubleshooting for common installation issues
  - **Support Documentation**: Clear escalation paths and contact information
  - **Diagnostic Tools**: Automated environment diagnostic script (`scripts/diagnose-install.sh`)
  - **Platform Coverage**: Comprehensive guidance for macOS/Linux/Windows permission issues
  - **Environment Management**: Support for nvm/volta Node version conflicts
  - **Network Issues**: Offline and network-restricted installation options

  ### Enhanced CLI Documentation
  - **Updated README**: Added comprehensive Support & FAQ sections
  - **Getting Started**: Improved documentation and links in root README
  - **Link Validation**: Extended CI workflow for documentation link checking

  ## 🔧 Technical Improvements

  ### CLI Enhancements
  - **Diagnostic Logging**: Added `PAIR_DIAG` environment variable for troubleshooting
  - **Release Detection**: Improved knowledge-hub dataset path resolution
  - **Error Handling**: Better error messages and diagnostics
  - **Configuration**: Enhanced config validation and loading

  ### Development Workflow
  - **Automated Publishing**: GitHub Packages integration in release workflow
  - **Quality Gates**: Comprehensive testing and validation pipeline
  - **Artifact Verification**: Smoke testing for both manual and npm artifacts

  ## 🏗️ Infrastructure

  ### Package Management
  - **Registry Configuration**: Added GitHub Packages publishConfig
  - **Metadata Validation**: Enhanced package.json with proper registry settings
  - **Distribution Modes**: Support for both manual ZIP and npm package distribution

  This release significantly improves the CLI distribution infrastructure, provides comprehensive user support resources, and establishes a robust foundation for future development with enhanced documentation and automated publishing workflows.

## 0.1.0
