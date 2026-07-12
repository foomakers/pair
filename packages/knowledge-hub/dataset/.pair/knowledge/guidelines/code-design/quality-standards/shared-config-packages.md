# Shared Config Packages

## Overview

Lint, format, type-check and markdown-lint rules duplicated across workspaces drift: each copy gets patched independently until "consistent tooling" is a fiction. The **shared-config-package pattern** fixes this by extracting each tool's configuration into its own workspace package, versioned like any other dependency, consumed via the tool's native extension mechanism (`extends`, `require`, or a `prettier`/similar field). One source of truth per concern; workspaces only carry local overrides.

This guideline documents the pattern generically and then walks through pair's own `tools/*` packages as the reference implementation (R7.1).

## The Pattern

1. **One package per concern** — do not bundle lint + format + types into a single "tooling" package. Each tool gets its own package (`*-config`) so it can version and release independently.
2. **Consume via the tool's own mechanism** — don't invent a custom loader. Use `extends` for `tsconfig.json`, `require`/`extends` for ESLint flat config, a `"prettier"` field in `package.json`, and a config-discovery bin wrapper for tools that don't support a field (markdownlint).
3. **Package the enforcement, not just the rules** — ship bin wrappers (`lint`, `lint-fix`, `prettier-check`, `markdownlint-check`, …) alongside the config so workspace `package.json` scripts stay one-liners instead of re-declaring flags/paths everywhere. (`mdlint:check` is the root script alias that calls the `markdownlint-check` bin — not a bin name itself.)
4. **Workspace configs carry only local overrides** — `paths`, `references`, `outDir`, package-specific `ignores`. Everything shared lives in the config package.
5. **Version like a dependency** — `@scope/*-config` is a `workspace:*` devDependency; bumping it (e.g. tightening a rule) is a normal dependency update, reviewed like one.

## Per-Type Overrides

Not every workspace needs the same ruleset. Split each config package into a **base** preset plus **type-specific** presets that extend it:

| Type | What changes vs base | Typical need |
| --- | --- | --- |
| Backend / service (Node CLI, API, worker) | Node types, module resolution | `node.json`-style preset |
| Frontend (web app) | JSX, DOM types, React lint rules | `ui.json`-style preset + React lint overlay |
| Shared lib | Depends on what the lib *is* — a logic-only lib behaves like backend, a UI component lib behaves like frontend | Pick the matching preset, not a third one |

Two rules keep this from becoming per-stack special-casing:

- **Only split where the tool actually needs it.** TypeScript compiler options and lint rules diverge by runtime (Node vs browser) — split those. Formatting does not diverge by type — keep one Prettier config for everything.
- **The taxonomy is about the preset the package needs, not the package's category.** A "shared lib" is not a third preset; it picks whichever existing preset (`node`/`ui`) matches what it ships.

## Reference Implementation: pair's `tools/*`

pair's own monorepo is the canonical example. Four config packages, each consumed differently based on what the underlying tool supports:

| Package | Presets / exports | Consumption | Bin wrappers |
| --- | --- | --- | --- |
| `tools/ts-config` (`@pair/ts-config`) | `base.json` → `node.json` / `ui.json` | `tsconfig.json`: `"extends": "@pair/ts-config/node.json"` | — (`tsc` runs directly) |
| `tools/eslint-config` (`@pair/eslint-config`) | `eslint.config.cjs` (base) → `eslint.config.react.cjs` (React overlay) | Base: bin wrappers apply it with no local file needed. Override: local `eslint.config.cjs` does `module.exports = require('@pair/eslint-config/eslint.config.react.cjs')` | `lint`, `lint-fix`, `eslint` |
| `tools/prettier-config` (`@pair/prettier-config`) | single `.prettierrc.json` (no per-type split — formatting doesn't diverge by type) | `package.json`: `"prettier": "@pair/prettier-config"` | `prettier-check`, `prettier-fix` |
| `tools/markdownlint-config` (`@pair/markdownlint-config`) | single `.markdownlint.jsonc` (+ ignore file) | discovered by the bin wrappers, no per-package config file | `markdownlint-check`, `markdownlint-fix` |

Per-type mapping in practice — Node/service/lib workspaces (`apps/pair-cli`, `packages/knowledge-hub`, `packages/content-ops`) extend `@pair/ts-config/node.json` and take the ESLint base config as-is. Frontend and UI-lib workspaces (`apps/website`, `packages/brand`) extend `@pair/ts-config/ui.json` and override `eslint.config.cjs` to layer the React overlay:

```jsonc
// apps/api/tsconfig.json (backend/CLI — node preset)
{ "extends": "@pair/ts-config/node.json", "compilerOptions": { /* local overrides only */ } }
```

```jsonc
// apps/web/tsconfig.json (frontend — ui preset)
{ "extends": "@pair/ts-config/ui.json", "compilerOptions": { "jsx": "preserve" /* local overrides only */ } }
```

```js
// packages/ui-lib/eslint.config.cjs (shared UI lib — same override as frontend, because it ships JSX)
module.exports = require('@pair/eslint-config/eslint.config.react.cjs')
```

Every consuming workspace declares the config packages as ordinary `workspace:*` devDependencies (see any `apps/*/package.json` or `packages/*/package.json`) — they are dependencies, not magic.

## Enforcement: Hooks

Configs without enforcement get bypassed under deadline pressure. Wire two git hooks:

- **Pre-commit** — fast local checks (type-check and/or lint on staged files).
- **Pre-push** — the full quality-gate command (lint + test + type-check), so nothing broken reaches CI.

**Husky is the KB default hook manager** (D21 / Q11) — `.husky/pre-commit` and `.husky/pre-push` scripts, wired via `"prepare": "husky install"` in the root `package.json`. pair's own hooks are two one-liners:

```sh
# .husky/pre-commit — fast local feedback
pnpm ts:check
```

```sh
# .husky/pre-push — full lint before code leaves the machine
pnpm quality-gate
```

A leaner project can put the actual lint/format commands on pre-commit instead (e.g. `lint-staged` running `eslint --fix` + `prettier --write` on staged files) and keep pre-push as the guard for anything pre-commit skipped. Either way, pre-push must run lint at minimum.

Adoption can override the hook manager (e.g. `lefthook`, `simple-git-hooks`) by recording the choice in `way-of-working.md`; `/pair-capability-setup-gates` reads that override before provisioning.

## Non-JS / Polyglot Projects

The shared-config-package mechanism above (`extends`, `require`, package-manager fields) is JS/TS-tooling-specific. For other ecosystems, the *pattern* still applies — one versioned config artifact per concern, per-type presets, hook-enforced — but provisioning cannot generate it automatically. In that case `/pair-capability-setup-gates` documents the pattern and points to the ecosystem's equivalent (e.g. a shared `ruff`/`clippy`/`golangci-lint` config package) rather than generating JS config files.

## Related

- [linting-tools.md](linting-tools.md) — tool selection matrix
- [eslint.md](eslint.md), [prettier-formatting.md](prettier-formatting.md) — per-tool configuration detail
- [automation.md](automation.md) — pre-commit/CI automation patterns
- `/pair-capability-setup-gates` — provisions this pattern on a project (see SKILL.md provisioning step)
- ADR-006 (`.pair/adoption/tech/adr/adr-006-shared-tsconfig.md`, pair's own dogfooded adoption) — the decision record for `tools/ts-config`
