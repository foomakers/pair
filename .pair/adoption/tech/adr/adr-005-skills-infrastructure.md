# ADR-005: Skills Infrastructure for Agent-Assisted Development

**Status:** Accepted
**Date:** 2026-02-10
**Context:** Epic #97 - Agent Skills in KB, Story #98 - Skill Infrastructure and Navigator

## Decision

Introduce a `.skills/` directory within the KB dataset as the source of truth for agent skills. Each skill is a markdown file (`SKILL.md`) following the Agent Skills open standard (agentskills.io). Skills are distributed to 6 AI tool directories via a flatten/prefix naming transform and multi-target distribution (one canonical copy + symlinks).

### Key Design Choices

1. **Directory structure**: `.skills/{category}/{skill-name}/SKILL.md` — skills organized by category (navigator, process, capability).
2. **Naming transforms**: Flatten (`navigator/next` → `navigator-next`) + prefix (`pair-navigator-next`) to produce unique, tool-compatible directory names.
3. **Multi-target distribution**: One canonical target (`.claude/skills/`) receives the physical copy; 5 secondary targets (`.github/skills/`, `.cursor/skills/`, `.agent/skills/`, `.agents/skills/`, `.windsurf/skills/`) receive symlinks pointing to canonical.
4. **Link rewriting**: Relative markdown links inside skill files are rewritten after flatten/prefix copy to maintain correctness.
5. **Configuration**: Skills registry defined in `config.json` with `flatten: true`, `prefix: "pair"`, `behavior: "mirror"`, and explicit `targets[]` array.

## Rationale

- **Open standard**: Agent Skills (agentskills.io) is supported by Claude Code, Cursor, VS Code Copilot, OpenAI Codex, and Windsurf. Adopting this standard maximizes tool compatibility.
- **Symlinks over copies**: Avoids content duplication across 6 targets, reducing disk usage and ensuring consistency. Windows environments fall back to copy mode (validated at config time).
- **Flatten/prefix**: AI tools expect skills in flat directory structures. Prefixing with `pair-` prevents naming collisions with skills from other sources.
- **KB-native**: Skills live in the KB dataset alongside existing `.pair/` content, leveraging the existing distribution pipeline (`pair install`, `pair update`).

## Consequences

**Positive:**

- Skills are discoverable by all major AI-assisted development tools
- Single source of truth in `.skills/`, distributed automatically
- Minimal storage overhead via symlinks
- Backward compatible — existing registries and workflows unaffected
- `SyncOptions` made stricter (required fields) with `defaultSyncOptions()` factory for ergonomics

**Negative:**

- Symlinks not supported on Windows without elevated privileges (mitigated: falls back to copy)
- `SyncOptions` breaking change requires all callers to provide required fields (mitigated: factory function)
- Link rewriting adds complexity to the copy pipeline

## Implementation

- **Transforms:** `packages/content-ops/src/ops/naming-transforms.ts` — `flattenPath()`, `prefixPath()`, `transformPath()`, `detectCollisions()`
- **Link rewriting:** `packages/content-ops/src/ops/link-rewriter.ts` — `rewriteLinksInFile()`, `rewriteLinksAfterTransform()`
- **Target validation:** `packages/content-ops/src/ops/behavior.ts` — `validateTargets()`, `TargetConfig`, `TargetMode`
- **Distribution:** `apps/pair-cli/src/registry/operations.ts` — `distributeToSecondaryTargets()`
- **Config:** `apps/pair-cli/config.json` — `skills` registry entry
- **Navigator skill:** `packages/knowledge-hub/dataset/.skills/navigator/next/SKILL.md`

## References

- Epic: #97
- Story: #98 (T-1 through T-10)
- PR: #106
- Standard: [agentskills.io](https://agentskills.io)
