# ADR-001: TTY Detection Pattern for CLI UX

**Status:** Accepted  
**Date:** 2025-12-04  
**Context:** Story #78 - CLI KB Installation UX Enhancements

## Decision

Use `process.stdout.isTTY` boolean check to conditionally enable interactive progress bars in TTY environments and fall back to simple log messages in non-TTY environments (CI/CD pipelines).

## Rationale

- **Automatic Detection**: No manual configuration required - works seamlessly in terminal and CI
- **Standard Node.js API**: Uses built-in `process.stdout.isTTY` (no external dependencies)
- **Graceful Degradation**: Progress bar in interactive terminals, simple logs in CI/CD
- **Reusable Pattern**: Applicable to any future CLI UX features requiring TTY awareness

## Consequences

**Positive:**

- Zero-config UX adaptation for different environments
- Professional progress display without CI log pollution
- Reusable pattern for future CLI enhancements (spinners, interactive prompts)

**Negative:**

- No way to force progress bar in non-TTY if needed (acceptable trade-off)

## Implementation

### Primary Pattern (Explicit TTY Check)

- **Module:** `apps/pair-cli/src/kb-manager/progress-reporter.ts`
- **Pattern:** Constructor accepts `isTTY` parameter, defaults to `process.stdout.isTTY`
- **Usage:** `new ProgressReporter(totalBytes, process.stdout.isTTY, process.stdout)`

### Acceptable Variant (Library Auto-Detection)

- **Module:** `apps/pair-cli/src/ui/presenter.ts`
- **Pattern:** Rely on library auto-detection (e.g., chalk automatically detects TTY via `supports-color`)
- **Usage:** `createCliPresenter(pushLog)` — chalk internally checks TTY and disables colors in non-TTY
- **Rationale:** Acceptable when library provides robust TTY detection. Avoids redundant checks.
- **Trade-off:** Less explicit but functionally equivalent. Library must be well-maintained and tested.

**When to use each:**

- Use **explicit check** when implementing custom UX logic (progress bars, spinners, prompts)
- Use **library auto-detection** when using well-established libraries (chalk, inquirer, ora) that handle TTY internally

## References

- Story: #78 (T-78.1, T-78.6)
- PR: #85 (primary pattern)
- PR: #133 (library auto-detection variant - CliPresenter)
- Tests: `apps/pair-cli/src/kb-manager/progress-reporter.test.ts`, `apps/pair-cli/src/ui/presenter.test.ts`
