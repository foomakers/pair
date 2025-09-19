# @pair/pair-cli

## 0.1.0

### Minor Changes

- 344f957: v0.1.0-team-adopter.1 — Internal alpha (CLI only)

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
