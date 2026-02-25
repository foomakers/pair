# @pair/pair-cli

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
