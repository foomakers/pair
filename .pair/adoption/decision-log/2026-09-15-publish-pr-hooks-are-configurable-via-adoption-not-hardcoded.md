# Decision: publish-pr hooks are configurable via adoption, not hardcoded

**Date:** 2026-09-15
**Status:** Adopted
**Category:** Adoption Delta

## Context

The `publish-pr` skill (and its implementation in `pair-capability-publish-pr`) currently contains hardcoded logic to run `pnpm mirrors:regenerate` before the quality gate. This mirrors the pair knowledge base (KB) to its generated mirrors (`.claude/skills/**`, `.claude/workflows/**`, `.pair/knowledge/**`, etc.) before the quality gate runs.

This logic is specific to the **pair repository** (dogfooding its own KB). For any other adopter of pair, this behavior is:

- Irrelevant (they may not use the same KB structure)
- Potentially harmful (runs a command that may not exist or do something unexpected)
- Not configurable (hardcoded in the skill/implementation)

The mirroring mechanism itself is generic and reusable (`pnpm mirrors:regenerate`, `scripts/regenerate-mirrors.sh`, `mirror-guard`, `skill-md-mirror`), but **what to mirror is pair-specific configuration** in `apps/pair-cli/config.json` (`asset_registries`).

## Decision

**Move the mirroring call from hardcoded in `publish-pr` to a configurable hook in adoption.**

### New mechanism: `## Publish-PR Hooks` in `tech/automation.md`

```markdown
## Publish-PR Hooks

Optional commands that `publish-pr` executes at defined points. Each hook is a shell command string.

- `pre-publish` — runs after PR creation, before quality gate. Fails the publish if non-zero.
- `post-publish` — runs after quality gate passes, before review dispatch. Failure does not block (logs only).
```

### Pair's configuration in `tech/automation.md`:

```markdown
## Publish-PR Hooks

- `pre-publish`: `pnpm mirrors:regenerate`
```

### Implementation changes:

1. **`publish-pr` skill** — reads `## Publish-PR Hooks` from `tech/automation.md` (if present), executes hooks in order, fails on non-zero for `pre-publish`
2. **Remove hardcoded `mirrors:regenerate`** from `publish-pr` skill/implementation
3. **Pair's `tech/automation.md`** declares the hook:

```markdown
## Publish-PR Hooks

- `pre-publish`: `pnpm mirrors:regenerate`
```

1. **Documentation** — update `publish-pr` skill doc, `github-automation.md`, `DEVELOPMENT.md`

## Consequences

### Positive

- **`publish-pr` becomes generic** — no pair-specific logic, reusable by any adopter
- **Adopters configure their own hooks** — CI triggers, notifications, custom validations, their own mirroring, etc.
- **Pair's mirroring stays exactly the same** — just declared in adoption instead of hardcoded
- **Future hooks** — `post-publish`, `pre-merge`, etc. can be added without code changes
- **Separation of concerns** — `publish-pr` = "publish PR", hooks = "side effects"

### Negative

- **One extra indirection** — adopters must discover and declare the hook; no default behavior

### Risks

- **None** — behavior is identical for pair, just moved to adoption
