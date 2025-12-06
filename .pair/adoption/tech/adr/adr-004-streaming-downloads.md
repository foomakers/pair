# ADR-004: Streaming Download Implementation

**Status:** Accepted  
**Date:** 2025-12-04  
**Context:** Story #78 - CLI KB Installation UX Enhancements

## Decision

Implement KB downloads using streaming writes with progress tracking instead of in-memory buffering. Use Node.js `https.get()` with response piping to file stream, track bytes written for progress updates.

## Rationale

- **Memory Efficiency**: KB files (5-10MB) should not be buffered entirely in memory
- **Progress Tracking**: Streaming allows real-time progress updates as data arrives
- **Standard Pattern**: Node.js streams are the idiomatic approach for file downloads
- **Performance**: Reduces memory footprint and improves responsiveness

## Consequences

**Positive:**

- Low memory footprint regardless of KB file size
- Real-time progress updates (every 100ms)
- Scalable pattern for larger files in future
- Standard Node.js idiom (no custom buffering logic)

**Negative:**

- Slightly more complex error handling (stream error events)
- Cannot compute checksum during download (requires separate read pass - acceptable trade-off)

## Implementation

- **Module:** `apps/pair-cli/src/kb-manager/download-manager.ts`
- **Pattern:**
  1. Create file write stream to destination (or `.partial` for resume)
  2. Issue `https.get()` or `https.request()` with Range header if resuming
  3. Pipe response to file stream
  4. Track `data` events for progress updates
  5. Handle `end` and `error` events for completion/failure
- **Progress Integration:** `data` event listener updates progress reporter every chunk
- **Resume Integration:** For resume, open `.partial` in append mode (`flags: 'a'`)

## References

- Story: #78 (T-78.1, T-78.4)
- PR: #85
- Tests: `apps/pair-cli/src/kb-manager/download-manager.test.ts`
