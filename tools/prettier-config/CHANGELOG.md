# @pair/prettier-config

## 0.4.1

### Patch Changes

- c53b8cf: Release v0.4.5 — Website, Docs & Brand Identity

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

### Patch Changes

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
