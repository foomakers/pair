# Manual Test Case Template

## MT-{GROUP}{NN}: {Title}

**Priority**: P0 | P1 | P2
**Preconditions**: {what must be true before execution — e.g. "release artifacts published", "clean temp directory created"}
**Category**: Website | CLI Artifact | CLI Functional | Dataset | Registry

### Steps

1. {concrete action with exact command, URL, or interaction}
2. {concrete action}
3. ...

### Expected Result

{objective, verifiable criteria — e.g. "HTTP 200", "exit code 0", "file exists at path", "output contains string X"}

### Notes

{edge cases, platform-specific behavior, related test IDs}

---

## Usage

- **Variables**: Use `$VERSION`, `$BASE_URL`, `$WORKDIR` — never hardcode values
- **Isolation**: Tests modifying the filesystem MUST operate in a temp directory disjoint from the source repo
- **Atomicity**: One test = one verifiable behavior
- **Grouping**: Group related tests into Critical Path files (CP1, CP2, etc.) ordered by release risk priority

## Priority Definitions

| Priority | Meaning | Release Impact |
|----------|---------|----------------|
| P0 | Blocks release sign-off | Must all pass |
| P1 | Important, workaround exists | Failures tracked as issues |
| P2 | Nice-to-have | Deferred if time-constrained |

## Example

```markdown
## MT-CP201: CLI binary reports correct version

**Priority**: P0
**Preconditions**: Manual ZIP artifact downloaded and extracted to $WORKDIR
**Category**: CLI Artifact

### Steps

1. Run `$WORKDIR/pair-cli --version`
2. Capture stdout

### Expected Result

- Exit code 0
- Output matches `$VERSION` (no prefix, no extra text)

### Notes

- On macOS the binary requires `chmod +x` after extraction
- Windows users test with `pair-cli.cmd` instead
```
