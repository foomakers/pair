# ADR-002: HTTP Range Requests for Download Resume

**Status:** Accepted  
**Date:** 2025-12-04  
**Context:** Story #78 - CLI KB Installation UX Enhancements

## Decision

Implement download resume capability using HTTP Range requests with `.partial` file tracking. Store incomplete downloads with `.partial` extension, resume from last byte position on retry using `Range: bytes=X-` header.

## Rationale

- **Network Resilience**: Large KB downloads (5-10MB) need resume capability for unstable connections
- **Bandwidth Efficiency**: Avoid re-downloading completed chunks (critical for slow/metered connections)
- **Standard Protocol**: HTTP Range requests are widely supported (RFC 7233)
- **User Experience**: Transparent resume - no manual intervention required

## Consequences

**Positive:**

- Robust download experience for unstable networks
- Bandwidth savings (especially for large KB files)
- Automatic cleanup of `.partial` files on success
- Server compatibility detection (fallback to fresh download if Range not supported)

**Negative:**

- Additional complexity for file size validation and mismatch detection
- `.partial` files persist on disk if download abandoned (acceptable - cleaned on next attempt)

## Implementation

- **Module:** `apps/pair-cli/src/kb-manager/resume-manager.ts`
- **Pattern:**
  1. Check for `.partial` file before download
  2. Validate remote file size matches partial size expectation
  3. Send `Range: bytes=<offset>-` header if resume applicable
  4. Append new data to `.partial` file
  5. Rename `.partial` to final name on completion
- **Fallback:** Fresh download if server returns non-206 response or size mismatch detected

## References

- Story: #78 (T-78.4)
- PR: #85
- Tests: `apps/pair-cli/src/kb-manager/resume-manager.test.ts`
- RFC: [RFC 7233 - HTTP Range Requests](https://tools.ietf.org/html/rfc7233)
