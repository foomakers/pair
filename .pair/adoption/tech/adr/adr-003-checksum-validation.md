# ADR-003: SHA256 Checksum Validation for File Integrity

**Status:** Accepted  
**Date:** 2025-12-04  
**Context:** Story #78 - CLI KB Installation UX Enhancements (Security Hardening)

## Decision

Validate all KB ZIP downloads using SHA256 checksums. Download `.sha256` file alongside ZIP, compute hash of downloaded file using Node.js `crypto` module, compare hashes. Auto-retry once on mismatch, warn if checksum file missing for custom URLs.

## Rationale

- **Security Hardening**: Prevents corrupted or malicious KB installations
- **Data Integrity**: Detects file corruption during download/storage
- **Standard Algorithm**: SHA256 is industry-standard for file integrity verification
- **No Dependencies**: Uses Node.js built-in `crypto` module (no external libs)
- **Proactive Security**: Added from PR #83 code review feedback (security best practice)

## Consequences

**Positive:**

- Critical security layer preventing tampered KB installations
- Detects network corruption issues before extraction
- Builds user trust in download integrity
- Reusable pattern for future file distribution features

**Negative:**

- Additional network request for `.sha256` file (minimal overhead)
- Checksum computation adds ~500ms-2s for typical KB size (acceptable)
- Custom URL sources may lack `.sha256` files (gracefully handled with warning)

## Implementation

- **Modules:**
  - `apps/pair-cli/src/kb-manager/checksum-validator.ts` - SHA256 computation and comparison
  - `apps/pair-cli/src/kb-manager/checksum-manager.ts` - `.sha256` file fetching
- **Pattern:**
  1. Download `.sha256` file from `{url}.sha256`
  2. Parse expected hash from file content
  3. Compute SHA256 of downloaded ZIP using `crypto.createHash('sha256')`
  4. Compare hashes (case-insensitive)
  5. On mismatch: delete ZIP, retry once, fail on second mismatch
  6. On missing `.sha256`: warn but continue (HTTPS provides transport security)
- **Error Handling:** Clear messages for validation failures, retry logic for transient issues

## References

- Story: #78 (T-78.5)
- PR: #85 (added from PR #83 code review recommendation)
- Tests: `apps/pair-cli/src/kb-manager/checksum-validator.test.ts`, `checksum-manager.test.ts`
