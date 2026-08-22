# @pair/pair-cli

## 0.5.0

### Minor Changes

- eb9575a: `pair kb-validate`: declare relative markdown links that point outside the KB tree as
  **optional**, instead of switching whole registries off to validate a KB in isolation.
  - New `--optional-link-patterns "<globs>"` flag (comma-separated) and new top-level
    `link_validation.optional_link_patterns` key in `pair.config.json` / `config.json`.
    The two are **merged** (union of the trimmed entries, deduplicated), never replaced.
  - A **missing** target matching a pattern is reported as
    `optional link (pattern-matched), target missing: …` — a warning that does not fail the
    run. A target that exists is simply valid; a missing target matching nothing stays an error.
  - `--strict` overrides optional patterns: in strict mode every missing target is an error.
  - Links carrying a non-http URI scheme (`mailto:`, `tel:`, `ftp:`, `vscode:`) are skipped:
    they are not filesystem paths, and were previously resolved as one and reported as broken
    internal links.
  - Patterns always match against the target resolved relative to the KB root (`apps/x.ts`) —
    the form to write them in, since it does not vary with the depth of the file the link is
    written in — and additionally against the link as written (`../../apps/x.ts`) only where that written
    form is a spelling of the same resolved target — its `../` climb lands on the KB root — or
    where the target leaves the KB tree. A link resolving back INSIDE the KB is matched on its
    resolved form only, so a broken in-KB link is still an error. Glob syntax: `**`, `*`, `?`,
    `[abc]`, anchored to the whole path — and anchored on the KB ROOT, so a leading `/` or `./`,
    a trailing `/` and repeated `/` are stripped from pattern and path alike (`/apps/**`, the way
    an absolute internal link is written, is the same rule as `apps/**`). A malformed pattern is
    warned about and skipped, never fatal.

  Fully backward compatible: with no patterns declared, every missing internal link is an
  error exactly as before.

  Also in this release:
  - A markdown link's destination is now parsed per CommonMark: a titled link
    (`[x](./b.md "Title")`) or a `<…>`-wrapped destination no longer has the title or the
    angle brackets captured as part of the target. Previously `kb-validate` reported such a
    link as broken even when its real target existed — an existing KB may see fewer errors
    after upgrading.
  - Every CLI command's console output now escapes C0/C1 control characters (`\xNN`), keeping
    `\t`/`\n` as real formatting. Closes the gap where a value read from a config file or a
    third-party KB could move the cursor, clear the screen, or forge a line of output.
  - `kb-validate`'s report gains a `Configuration:` section for run-level diagnostics (a
    malformed pattern, a bad config shape); these are now counted in the report's `Warnings:`
    total instead of only being logged.
  - `--ignore-config` now prints a notice explaining that no config is read and link
    validation does not run, instead of running silently.

### Patch Changes

- 5f53e9a: `.pair/llms.txt` indexes the real adoption layout. The generator scanned `.pair/product/adopted/` and `.pair/tech/adopted/` — paths no shipped dataset has ever created — so every `pair install` / `pair update` produced an index with no `## Adoption — Product` and no `## Adoption — Tech` section, silently. It now scans `.pair/adoption/product/` and `.pair/adoption/tech/`, and the generated index lists the adoption files an agent is told to read.

  The generator also gains a `## Adoption — Decisions` section, indexing `.pair/adoption/decision-log/` — ADR entries live under `Adoption — Tech` (reached via `adoption/tech/adr/`), but ADL and analysis entries had no section at all, so every generated index presented the project's decision record as ADR-only.
  - @pair/content-ops@0.5.0
  - @pair/knowledge-hub@0.5.0

## 0.4.3

### Minor Changes

- 89e03be: feat: publish @foomakers/pair-cli to npmjs.org (#181)
  fix: wire --config through dispatch path for update and install (#186)
  fix: depth-aware link rewriting in target-layout packaging (#187)
  fix: bypass cache when --source/customUrl is provided (#189)
  fix: normalize include paths in buildCopyOptions to match resolveBehavior keys

### Patch Changes

- @pair/knowledge-hub@0.4.3

## 0.4.2

### Patch Changes

- a698478: Fix package validation to respect `--layout` target resolution.
  - @pair/knowledge-hub@0.4.2

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
  - @pair/knowledge-hub@0.4.1

## 0.4.0

### Minor Changes

- f9a4878: Add organizational KB packaging (--org flag) and kb-info command

### Patch Changes

- @pair/knowledge-hub@0.4.0

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
  - Replace boolean `--verbose` flags with explicit `--log-level <level>` across the CLI. Migration: use `--log-level debug` where you previously used `--verbose`. (Note: backward-compat alias not added in this release.)
  - Separate KB dataset release workflow and auto-download/cache manager
    for runtime KB consumption.
  - Multiple UX and reliability improvements: retry logic, TTY detection,
    streaming downloads, and improved error messages.
  - Minor fixes.

  This release is backward compatible and focuses on KB distribution and
  packaging features for adopters and teams managing private KBs.

### Patch Changes

- Updated dependencies [ba651dd]
  - @pair/knowledge-hub@0.3.0

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

### Patch Changes

- Updated dependencies
  - @pair/knowledge-hub@0.2.0

## 0.1.0

### Minor Changes

- 324000b: v0.1.0-team-adopter.1 — Internal alpha (CLI only)

  Summary
  - This is an internal alpha release of the `pair` CLI for team testing and feedback.
  - Not a public release and not v1 — intended for rapid iteration by internal testers.

  What’s included
  - `@pair/pair-cli` (CLI): initial feature release for installing and managing documentation/knowledge assets.
  - This changeset does NOT publish private workspace packages (`@pair/knowledge-hub`, `@pair/content-ops`) to npm. The knowledge dataset may be included in the manual bundle (ZIP) distributed with this release.

  High-level changelog
  - `@pair/pair-cli` bumped (minor): initial internal alpha feature set and CLI packaging.

  How to get and verify the artifact
  - Preferred (manual bundle): download the attached ZIP (example name: `pair-cli-manual-v0.1.0-team-adopter.1.zip`) and verify the checksum file `pair-cli-manual-v0.1.0-team-adopter.1.zip.sha256`.
  - To run locally after extracting the bundle:
    - Unix/macOS: `./pair-cli --help` `./pair-cli install --list-targets` `./pair-cli --version`
    - Windows: `pair-cli.cmd --help`

  Suggested tests (what to exercise)
  - CLI sanity: `--version`, `--help`, `install --list-targets`.
  - Install flow: run `pair-cli install` in a disposable folder and inspect created files.
  - Update flow: run `pair-cli update` against an existing install and verify link correction/overwrites.
  - Config validation: `pair-cli validate-config` with default and malformed configs.
  - Edge cases: non-empty target folder behavior, missing source paths.

  Known limitations
  - Internal alpha: expect UX rough edges, incomplete error messages, and possible breaking changes in subsequent releases.
  - Dataset/manual bundle is a separate artifact and is not an npm package bump for private workspace packages.

  Artifact naming guidance
  - Artifact: `pair-cli-manual-v0.1.0-team-adopter.1.zip`
  - Checksum: `pair-cli-manual-v0.1.0-team-adopter.1.zip.sha256`

  Contacts & reporting
  - Contact: see `author` in `apps/pair-cli/package.json` or open issues in this repository. Include OS, command, output, and artifact checksum when reporting bugs.

### Patch Changes

- @pair/knowledge-hub@0.1.0
