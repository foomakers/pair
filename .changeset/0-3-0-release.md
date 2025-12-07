---
'@pair/pair-cli': minor
'@pair/content-ops': minor
'@pair/knowledge-hub': minor
'@pair/eslint-config': patch
'@pair/prettier-config': patch
---

Prepare release `0.3.0`.

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
