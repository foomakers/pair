# Release Validation — Manual Test Suite

Post-release manual tests that validate the pair website, CLI artifacts, and published packages from the end-user perspective.

## Prerequisites

No special auth scopes needed for CP1–CP9 on `$CHANNEL=final` — the package is public on npmjs.org. On `pre`/`rc` the package lives on GitHub Packages and the install cases need a token with `read:packages` (see [Channels](#channels-channel)).

**CP10 is the exception**: it exercises pair from a cloud/web coding environment, so it requires a
Claude Code Web session with this repository open and a working GitHub access path **inside that
session** — `gh` authenticated, or a GitHub MCP tool (Claude Code Web does not ship `gh` at all) —
since it opens a real pull request. Its preconditions are written as verifiable checks — see
[CP10-web-cloud-environment.md](CP10-web-cloud-environment.md) — and no credential is ever
recorded in the suite or in a report.

## Variables

All test cases use these variables — resolve them before execution:

| Variable | How to resolve |
|----------|---------------|
| `$CHANNEL` | `final` (default), `rc` or `pre` — decides the registry and which CPs run (see [Channels](#channels-channel)) |
| `$VERSION` | `pair-cli --version` from the artifact under test, or tag name stripped of `v` prefix |
| `$BASE_URL` | Production website URL (e.g. `https://pair.foomakers.com`); on pre/rc only a PR preview URL, if used |
| `$RELEASE_URL` | `https://github.com/foomakers/pair/releases/tag/v$VERSION` |
| `$WORKDIR` | Temp directory **outside** the repo: `mktemp -d /tmp/pair-release-test.XXXXX` |

## Channels (`$CHANNEL`)

| | `final` | `pre` / `rc` |
|---|---|---|
| Registry | npmjs.org, no auth | GitHub Packages `https://npm.pkg.github.com`, `read:packages` token |
| Website (CP1, CP5, CP6) | production `$BASE_URL` | not deployed: final-only, or a PR preview `$BASE_URL` |
| npmjs-only cases (CP7 npmjs.org, MT-CP320 npmjs path) | run | SKIP (final-only); use the GitHub Packages variant |
| MT-CP211 `publishConfig` | npmjs | npmjs `publishConfig` is expected |

Token rules: supplied by the operator via a project `.npmrc` or env var, deleted after the run, **never recorded** in the suite or a report. No token on pre/rc ⇒ the install cases are **BLOCKED**, not FAILED.

Prerelease cleanup: after a newer pre/rc (or final) is published the older ones are deleted, including the KB asset. Validating an old prerelease then needs `install --source` (see CP11).

## Critical Paths

Execute in order. P0 blocks release sign-off.

| CP | File | Priority | Description |
|----|------|----------|-------------|
| CP1 | [CP1-website-critical-path.md](CP1-website-critical-path.md) | P0 | Landing page, core navigation, responsive, meta tags |
| CP2 | [CP2-cli-artifact-critical-path.md](CP2-cli-artifact-critical-path.md) | P0 | ZIP + TGZ download, checksum, --version, --help |
| CP3 | [CP3-cli-install-update.md](CP3-cli-install-update.md) | P0 | install (auto-download KB + explicit source), update, idempotency, keep choice persisted (`skipRegistries`) |
| CP4 | [CP4-kb-dataset.md](CP4-kb-dataset.md) | P1 | KB ZIP artifact, manifest, verify, info |
| CP5 | [CP5-website-docs-completeness.md](CP5-website-docs-completeness.md) | P1 | All doc pages return 200, version consistency, internal links |
| CP6 | [CP6-website-search-navigation.md](CP6-website-search-navigation.md) | P1 | Orama search, sidebar, prev/next, llms.txt, privacy |
| CP7 | [CP7-registry-publish.md](CP7-registry-publish.md) | P0 | npmjs.org visibility, install from public registry |
| CP8 | [CP8-packaging.md](CP8-packaging.md) | P1 | `pair-cli package` with source/target layouts, metadata, validation |
| CP9 | [CP9-quickstart-onboarding.md](CP9-quickstart-onboarding.md) | P1 | Timed quickstart onboarding: bootstrap `$mode: quick` under 10 min, guided regression |
| CP10 | [CP10-web-cloud-environment.md](CP10-web-cloud-environment.md) | P1 | pair from Claude Code Web: skills executable, story end-to-end to a PR, dev-server limit as expected result. **Manual, run inside the web session** |
| CP11 | [CP11-release-pipeline.md](CP11-release-pipeline.md) | P0 | `pnpm release --dry-run`, duplicate refusal, dispatch-only workflows, same-channel cleanup, `--source` after cleanup. **Inspection only, no real dispatch** |
| CP12 | [CP12-plugin-marketplace.md](CP12-plugin-marketplace.md) | P1 | Claude Code marketplace: add, install `pair@pair`, `/pair-assistant`, existing-repo keep/overwrite, keep persisted across `update`. **Manual, run inside Claude Code** |

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
1. Resolve $VERSION, $BASE_URL, $RELEASE_URL, create $WORKDIR
2. Execute CP1 → CP2 → CP3 → ... → CP9, then CP11 (CP10 and CP12 are executed separately, from inside a Claude Code Web session, CP12 from inside Claude Code — a local run cannot observe them). On `pre`/`rc` skip or re-target the final-only cases per [Channels](#channels-channel)
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
- [ ] npmjs.org publish config changed → update CP7
- [ ] Landing page sections changed → update CP1
- [ ] Bootstrap resolution depths or their defaults changed → update CP9
- [ ] Release pipeline (`pnpm release`, workflows, cleanup) changed → update CP11
- [ ] Plugin/marketplace manifest changed → update CP12
- [ ] CLI commands, registries or KB paths changed → update the counts asserted in CP2 (commands), CP3 (registries, installed paths)
- [ ] Web/cloud environment capabilities changed (skill discovery, `gh`/MCP availability, dev-server exposure) → update CP10

When updating, increment the test count in this README and add a changelog entry at the bottom of the affected CP file.
