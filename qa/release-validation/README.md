# Release Validation — Manual Test Suite

Post-release manual tests that validate the pair website, CLI artifacts, and published packages from the end-user perspective.

## Prerequisites

The `gh` CLI token must include `read:packages` scope (required by CP7 — GitHub Packages registry tests). Verify and fix:

```bash
# Check current scopes
gh auth status   # look for 'read:packages' in Token scopes

# Add if missing (one-time, persists across sessions)
gh auth refresh -h github.com -s read:packages
```

## Variables

All test cases use these variables — resolve them before execution:

| Variable | How to resolve |
|----------|---------------|
| `$VERSION` | `pair-cli --version` from the artifact under test, or tag name stripped of `v` prefix |
| `$BASE_URL` | Production website URL (e.g. `https://pair.foomakers.com`) |
| `$RELEASE_URL` | `https://github.com/foomakers/pair/releases/tag/v$VERSION` |
| `$WORKDIR` | Temp directory **outside** the repo: `mktemp -d /tmp/pair-release-test.XXXXX` |
| `$REGISTRY` | `https://npm.pkg.github.com/` |
| `$NPM_TOKEN` | `gh auth token` (reuses authenticated `gh` CLI session; requires `read:packages` scope — see Prerequisites) |

## Critical Paths

Execute in order. P0 blocks release sign-off.

| CP | File | Priority | Description |
|----|------|----------|-------------|
| CP1 | [CP1-website-critical-path.md](CP1-website-critical-path.md) | P0 | Landing page, core navigation, responsive, meta tags |
| CP2 | [CP2-cli-artifact-critical-path.md](CP2-cli-artifact-critical-path.md) | P0 | ZIP + TGZ download, checksum, --version, --help |
| CP3 | [CP3-cli-install-update.md](CP3-cli-install-update.md) | P0 | install (auto-download KB + explicit source), update, idempotency |
| CP4 | [CP4-kb-dataset.md](CP4-kb-dataset.md) | P1 | KB ZIP artifact, manifest, verify, info |
| CP5 | [CP5-website-docs-completeness.md](CP5-website-docs-completeness.md) | P1 | All doc pages return 200, version consistency, internal links |
| CP6 | [CP6-website-search-navigation.md](CP6-website-search-navigation.md) | P1 | Orama search, sidebar, prev/next, llms.txt, privacy |
| CP7 | [CP7-registry-publish.md](CP7-registry-publish.md) | P2 | GitHub Packages visibility, install from registry |

## Execution by AI Assistant

This suite is designed to be executed by an AI coding assistant (Claude Code, Cursor, Copilot). The following instructions maximize determinism and reliability.

### Tool Selection

| Action | Preferred | Fallback | Notes |
|--------|-----------|----------|-------|
| Website page load + interaction | `agent-browser` skill | Playwright MCP (`browser_navigate`, `browser_snapshot`) | Real browser rendering, catches JS errors |
| Bulk URL status checks | `WebFetch` or `curl -sI` via Bash | `agent-browser` (slower) | Faster for batch 200-checks without rendering |
| CLI commands | Bash tool | — | Direct execution, capture exit code + stdout |
| File existence/content | Read tool or Bash `test -f` | — | Filesystem assertions |
| Checksum verification | Bash `sha256sum` / `shasum -a 256` | — | Platform-appropriate |
| Search UI interaction | `agent-browser` (fill form, click, screenshot) | Playwright MCP (`browser_press_key`, `browser_fill_form`) | Simulates Cmd+K, typing, clicking |
| Visual verification (responsive) | `agent-browser` (resize viewport, screenshot) | Playwright MCP (`browser_resize`, `browser_take_screenshot`) | Viewport-specific screenshots |
| Report generation | Write tool | — | Produce report from template |

**Priority**: use `agent-browser` when available (high-level, portable across agents). Fall back to Playwright MCP if `agent-browser` is not installed. Use `WebFetch`/`curl` for bulk HTTP checks where rendering is not needed.

### Context Management

1. **Resolve variables first**: before executing any test, resolve all `$VARIABLES` and state them explicitly
2. **Create $WORKDIR once**: `mktemp -d /tmp/pair-release-test.XXXXX` — reuse for all CP2/CP3/CP4 tests
3. **Create `$WORKDIR/.npmrc` once** for all CP7 tests: extract token via `gh auth token`, write scoped `.npmrc` with `@foomakers:registry` + auth. Reused by all registry tests.
3. **One CP at a time**: complete all tests in a CP before moving to the next; report partial results if context limit approaches
4. **Capture evidence inline**: for failures, capture command output or screenshot immediately — don't defer
5. **Final cleanup**: remove `$WORKDIR` only after report is generated

### Determinism Strategies

- **Never rely on timing**: use explicit waits for page load (Playwright `waitUntil: 'networkidle'`), not `sleep`
- **Assert on stable selectors**: use text content, `data-testid`, or semantic elements — not CSS classes that change per build
- **Checksum comparison**: always compare computed hash against `.sha256` file content, not hardcoded values
- **Version from artifact**: extract `$VERSION` from the artifact itself, never from repo source code
- **Isolated filesystem**: `$WORKDIR` must be outside the repo to avoid pnpm workspace interference
- **Clean npm environment**: when testing `npm install`, use `--no-workspaces` and ensure no `.npmrc` inherits from parent dirs

### Workflow

```text
0. Verify gh auth scopes include read:packages (see Prerequisites)
0.5. Create $WORKDIR/.npmrc with scoped registry auth (uses $NPM_TOKEN from gh auth token)
1. Resolve $VERSION, $BASE_URL, $RELEASE_URL, create $WORKDIR
2. Execute CP1 → CP2 → CP3 → ... → CP7
3. For each test: record PASS/FAIL/SKIP with evidence
4. Generate report using manual-test-report-template.md
5. Save to .tmp/manual-test-reports/release-validation-$VERSION-$(date +%Y-%m-%d).md
6. Summarize results to user
7. Cleanup $WORKDIR
```

## Suite Maintenance — Review Checklist

Consult before each release. If any condition is true, update the corresponding CP file.

- [ ] New docs pages added or removed → update CP5 page list
- [ ] New CLI commands added → update CP3
- [ ] CLI config.json registries changed → update CP3 install expectations
- [ ] New artifact type in release → update CP2 or add new CP
- [ ] Website framework changed (Fumadocs, search engine, hosting) → update CP1, CP6
- [ ] New integration page → update CP5
- [ ] Deploy target changed → update CP1
- [ ] New distribution channel (brew, npx global, etc.) → add to CP2 or new CP
- [ ] GitHub Packages config changed → update CP7
- [ ] Landing page sections changed → update CP1

When updating, increment the test count in this README and add a changelog entry at the bottom of the affected CP file.
