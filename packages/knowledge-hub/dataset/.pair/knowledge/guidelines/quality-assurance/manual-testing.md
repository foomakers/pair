# Manual Testing Guidelines

## Purpose

Systematic approach to designing, organizing, and executing manual tests that validate released software from the end-user perspective. Manual tests complement automated quality gates by covering subjective quality, cross-system integration, and real-world usage scenarios that automation cannot fully address.

This guideline focuses on the **execution mechanics**: test case format, critical path grouping, AI-assisted execution, report generation. For the organizational framework (who verifies, when, which areas, team roles, review gates), see [manual-verification.md](manual-verification.md).

## When to Use Manual Testing

- **Post-release validation**: verify that published artifacts, live websites, and distributed packages work correctly after deployment
- **Exploratory testing**: discover issues through unstructured investigation of user flows
- **Accessibility spot-checks**: validate keyboard navigation, screen reader behavior, and visual contrast beyond automated axe-core scans
- **Cross-browser/device validation**: verify rendering and interaction on real devices
- **Install/upgrade flows**: test package installation from the user's perspective in isolated environments

## Test Case Design

### Structure

Each test case must be self-contained and version-agnostic. Use variables (e.g. `$VERSION`, `$BASE_URL`) instead of hardcoded values.

```markdown
## MT-{GROUP}{NN}: {Title}

**Priority**: P0 | P1 | P2
**Preconditions**: {what must be true before execution}
**Category**: {Website | CLI Artifact | CLI Functional | Dataset | Registry}

### Steps

1. {concrete, observable action}
2. {concrete, observable action}

### Expected Result

{objective pass/fail criteria — no ambiguity}

### Notes

{edge cases, variants, environment-specific considerations}
```

### Principles

- **Version-agnostic**: derive version from the artifact under test (e.g. `pair-cli --version`), never hardcode
- **Environment-isolated**: install/update tests MUST use a directory disjoint from the source repo (e.g. `/tmp/pair-test-{random}/`)
- **Idempotent**: re-running a test produces the same result without manual cleanup
- **Observable**: every step produces a verifiable output (HTTP status, file existence, command exit code, visual state)
- **Atomic**: one test = one concern; combine in critical paths for sequencing

### Grouping by Critical Path

Organize test cases into **Critical Paths (CP)** ordered by release risk:

| Priority | Description |
|----------|-------------|
| P0 | Blocks release sign-off — must all pass |
| P1 | Important but workaround exists — failures tracked as issues |
| P2 | Nice-to-have — deferred if time-constrained |

Each CP is a separate file containing related test cases. A `README.md` in the test suite directory provides execution order, tooling instructions, and the review checklist.

## Test Report

After execution, produce a report capturing results, environment, and evidence of failures.

### Report Structure

```markdown
# Release Validation Report — v{VERSION}

**Date**: {YYYY-MM-DD}
**Tester**: {human or AI agent ID}
**Environment**: {OS, Node version, browser}

## Summary

| Critical Path | Total | Pass | Fail | Skip | Blocked |
|---------------|-------|------|------|------|---------|
| CP1 | X | X | X | X | X |
| **Total** | **X** | **X** | **X** | **X** | **X** |

## Result: PASS | FAIL

## Failures

### MT-{ID}: {title}
- **Actual result**: {what happened}
- **Evidence**: {screenshot path, command output, HTTP response}
- **Severity**: Critical | Major | Minor
- **Issue**: #{number} (if created)

## Sign-off

- [ ] All P0 tests pass
- [ ] No Critical/Major failures unresolved
```

### Report Storage

Reports are ephemeral and gitignored. Recommended location: `.tmp/manual-test-reports/`. Attach to GitHub Release comments when a permanent record is needed.

## AI-Assisted Execution

Manual tests can be executed by AI coding assistants. The recommended tool strategy for browser-based tests:

- **Preferred**: `agent-browser` skill — high-level browser automation interface (navigate, screenshot, fill form, click, extract data). Works across any agent that supports Agent Skills.
- **Fallback**: Playwright MCP (`browser_navigate`, `browser_snapshot`, `browser_click`) — lower-level, requires MCP plugin configured.
- **Minimal**: `WebFetch` or `curl` via CLI — for bulk HTTP status checks only (no rendering, no interaction).

For CLI and filesystem tests, use the agent's native Bash/shell execution.

See the project's test suite `README.md` for detailed tool mapping, context management, and determinism strategies.

## Suite Maintenance

Before each release, review the test suite against recent changes:

- New pages/routes added → update website completeness tests
- New CLI commands added → update functional tests
- Artifact format changed → update artifact validation tests
- New distribution channel added → add new critical path
- Framework/infra changed → update critical path assumptions

Document the review checklist alongside the test suite, not in this guideline.
