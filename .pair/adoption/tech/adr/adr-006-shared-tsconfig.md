# ADR-006: Shared TypeScript Configuration

**Status:** Accepted
**Date:** 2026-02-17
**Context:** Story #120 - Brand Identity (T-1)

## Decision

Extract duplicated TypeScript compiler options into a shared configuration package (`tools/ts-config`) with three presets: `base.json` (25+ strict compiler options), `node.json` (extends base + Node.js types), and `ui.json` (extends base + React/JSX/DOM). All workspaces migrate to extend from these presets, retaining only workspace-specific overrides.

### Key Design Choices

1. **Shared config package**: `tools/ts-config/` follows existing `tools/*-config` pattern (eslint, prettier, markdownlint)
2. **Three-tier preset hierarchy**: `base.json` → `node.json`/`ui.json` → workspace tsconfig.json
3. **Minimal workspace configs**: Only local overrides remain (`paths`, `references`, `declaration`, `noEmit`)
4. **Zero behavioral change**: Identical compilation output before and after migration

## Rationale

- **Duplication eliminated**: Before migration, 3 workspaces (pair-cli, knowledge-hub, content-ops) each duplicated ~25 lines of identical strict compiler options
- **DRY principle**: A single source of truth for TypeScript settings reduces maintenance burden
- **Consistency**: All Node.js packages use identical type checking rules
- **Future-proof**: New packages (e.g., `@pair/brand`) extend appropriate preset with zero boilerplate
- **Tool pattern alignment**: Follows established pattern of shared build tool packages in the monorepo

## Consequences

**Positive:**

- 75+ lines of duplicated tsconfig content eliminated across 3 workspaces
- New React/UI packages (brand, website) get React/JSX config with single `extends` line
- TypeScript upgrades affect single base.json, not 8+ workspace configs
- Workspace configs reduced to 5-10 lines (extends + local overrides only)
- No runtime performance impact — compile-time only change

**Negative:**

- New dependency for all workspaces (`@pair/ts-config` in devDependencies)
- Breaking change if base.json evolves — affects all workspaces (mitigated: pin versions during updates)
- Debugging tsconfig inheritance requires reading 2 files instead of 1

## Implementation

- **Package:** `tools/ts-config/` — package.json exports `base.json`, `node.json`, `ui.json`
- **Base config:** `tools/ts-config/base.json` — 25+ strict compiler options shared by all workspaces
- **Node preset:** `tools/ts-config/node.json` — extends base + `types: ["node"]`, `module: "NodeNext"`, `moduleResolution: "nodenext"`
- **UI preset:** `tools/ts-config/ui.json` — extends base + `jsx: "react-jsx"`, `lib: ["dom", "dom.iterable", "esnext"]`
- **Migrated workspaces:**
  - `apps/pair-cli/tsconfig.json` — extends node.json + local `paths`/`references`
  - `packages/knowledge-hub/tsconfig.json` — extends node.json + local `references`
  - `packages/content-ops/tsconfig.json` — extends node.json + local `declaration`
  - `packages/brand/tsconfig.json` — extends ui.json (new package)

## Adoption Impact

- `adoption/tech/tech-stack.md` — no direct entry (tool package, not a runtime dep); `@pair/ts-config` listed as workspace dependency in all migrated packages
- All migrated `tsconfig.json` files updated to `extends: "@pair/ts-config/node.json"` or `"@pair/ts-config/ui.json"`

> **Note:** This ADR also covers the ESLint React overlay (`tools/eslint-config/eslint.config.react.cjs`) introduced in the same task. The overlay adds `plugin:react` and disables `no-undef` for TypeScript files; it is consumed by `packages/brand/eslint.config.cjs`.

## References

- Story: #120 (Brand Identity)
- Task: T-1 (shared build infrastructure)
- Task: T-2 (workspace migration)
- Commit: `[#120] feat: create shared tsconfig + ESLint React overlay`
