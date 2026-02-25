# Manual Test Report Template

## {Test Suite Name} Report — v{VERSION}

**Date**: {YYYY-MM-DD}
**Tester**: {name or AI agent identifier}
**Environment**:

- OS: {e.g. macOS 15.3 arm64, Ubuntu 24.04 x86_64}
- Runtime: {e.g. Node v20.11.0, Python 3.12}
- Browser: {e.g. Chrome 125, Safari 18, N/A}

**Artifact under test**: {URL, file path, or package identifier}

## Summary

<!-- List each critical path or test group from the project's test suite -->

| Test Group | Total | Pass | Fail | Skip | Blocked |
|------------|-------|------|------|------|---------|
| {Group 1} | | | | | |
| {Group 2} | | | | | |
| ... | | | | | |
| **Total** | **0** | **0** | **0** | **0** | **0** |

## Result: {PASS | FAIL}

## Failures

<!-- Repeat this block for each failure -->

### MT-{ID}: {title}

- **Actual result**: {what happened instead of expected}
- **Evidence**: {screenshot path, command output, HTTP status, log excerpt}
- **Severity**: Critical | Major | Minor
- **Regression**: Yes | No | Unknown
- **Issue**: #{issue_number} or "to be created"

## Skipped / Blocked Tests

| Test ID | Reason |
|---------|--------|
| MT-{ID} | {why skipped or blocked — e.g. missing credentials, environment unavailable} |

## Observations

{any additional findings, performance impressions, UX issues, or patterns noticed during testing that are not tied to a specific test case}

## Sign-off Criteria

- [ ] All P0 tests pass
- [ ] All P1 tests pass or have accepted workarounds documented
- [ ] No Critical severity failures unresolved
- [ ] No Major severity failures unresolved
- [ ] Report reviewed and filed

---

## Usage

- Store reports in a gitignored directory (e.g. `.tmp/manual-test-reports/`)
- Filename convention: `{suite-name}-{VERSION}-{YYYY-MM-DD}.md`
- Attach to release artifacts (GitHub Release comment, CI summary) when a permanent record is needed
- Fill the Summary table first for quick triage, then detail individual failures
