# Design Rules

## Overview

Evidence-based do/don't rules for patterns that repeatedly show up as tech-debt in codebase audits — the ones an AI assistant tends to (re)generate unless explicitly constrained. Each rule: **recognition** (how to spot it), **alternative** (what to do instead), **evidence** (real finding it comes from). No separate anti-pattern catalog — these rules live here, in the code-design guidelines, and are consolidated as new evidence appears.

**Precedence**: if a rule conflicts with a project's own adoption decision (`.pair/adoption/tech/`), the adoption decision wins. Note the override next to the rule it affects instead of deleting the rule (it may still apply to other projects/packages).

**Review usage**: a diff clearly matching a rule's recognition criteria is a **violation** — reference the rule ID in the finding. A partial or uncertain match is a **suggestion**, not a violation — don't block on it.

**Migration**: existing code already violating a rule is tracked as `tech-debt` (Draft, P1–P3 by impact/effort) — see `technical-debt.md`. Violations never block a PR by themselves; only new code introducing a fresh instance of a known rule is a review finding.

## DR-1 — God Module (oversized file / class)

**Don't**: let a file or class absorb every function related to a topic as it grows, until it covers several unrelated responsibilities (parsing + validation + I/O + logging in the same file).

**Recognition**: a single non-test file keeps growing past the point where its exports no longer share one responsibility — usually visible as 15+ exported functions/methods, or a file so large its one-line "what it does" summary needs an "and".

```typescript
// copyPathOps.ts — copy, mirror-cleanup, link rewriting, validation, logging...
export async function copyFile(...) {}
export async function copyDirectory(...) {}
export async function handleMirrorCleanup(...) {}
// + 16 more exports, unrelated concerns, one file
```

**Do**: split along natural seams — one file per responsibility — as soon as a module accumulates concerns that don't change for the same reason. Re-export from an index only if a stable public API is required.

```typescript
// copy-file.ts         — single-file copy
// copy-directory.ts    — directory traversal + recursion
// copy-orchestrator.ts — dispatch + shared setup
```

**Evidence** (historical — all resolved in #199): `copyPathOps.ts` (705 LOC / 19 functions), `cli.e2e.test.ts` (1507 LOC), `dev/App.tsx` (456 LOC / 11 inline sections), `in-memory-fs.ts` (429 LOC) — a recurring cluster in `content-ops/src/ops/` (4 of the 2026-04-17 audit's top-10 largest files), each since split along its natural seams. See Migration Plan below.

## DR-2 — Static-Only Namespace Class

**Don't**: wrap a set of stateless functions in a `class` used only for its `static` methods. It adds ceremony (import the class, call through it) without adding behavior — no instance, no state, no polymorphism.

**Recognition**: a class where every method is `static` and no instance property/state exists — it's a namespace pretending to be an object.

```typescript
// Illustrative anti-pattern (not live code):
export class LinkProcessor {
  static async extractLinks(content: string) {}
  static async extractLinksFromFile(path: string, fs: FileSystemService) {}
  // 18 static methods total, zero instance state
}
```

**Do**: use a module with named exports. TypeScript modules already are the namespace — no wrapper class needed.

```typescript
// link-processor.ts
export async function extractLinks(content: string) {}
export async function extractLinksFromFile(path: string, fs: FileSystemService) {}
```

**Evidence** (historical — resolved in #199): `markdown/link-processor.ts` once exposed a `class LinkProcessor` with 18 static methods; #199 converted it to a module of named function exports (the direction the file's own compat re-exports were already pointing). See Migration Plan below.

## DR-3 — Optional-Bag Dispatch Instead of Discriminated Union

**Don't**: model "this is either an A or a B" as one object type where A's and B's fields are all optional (`Partial<A & B>`), then branch with `if (isA) {...} else if (isB) {...}` and force each field with a non-null assertion (`!`) at every use site. This is the concrete, type-unsafe cousin of "too many ifs": the compiler can't tell you which fields are actually present in each branch, so every read needs a manual assertion instead of the compiler narrowing it for you.

**Recognition**: a `Partial<X & Y>` (or several optional fields) combined with `if`/`else if` branches on a runtime check (e.g. `stat.isDirectory()` / `stat.isFile()`), where each branch re-picks a subset of fields and asserts them non-null.

```typescript
type MoveCtx = Partial<HandleDirectoryMoveParams & HandleFileMoveParams> & {
  fileService: FileSystemService
  srcPath: string
  destPath: string
}

if (stat.isDirectory()) {
  await handleDirectoryMove({ ...ctx, source: ctx.source!, target: ctx.target! })
} else if (stat.isFile()) {
  await handleFileMove({ ...ctx, source: ctx.source!, target: ctx.target! })
}
```

**Do**: model the branches as a discriminated union with a tag field, and let the compiler narrow — no assertions needed.

```typescript
type MoveOp =
  | { kind: 'directory'; params: HandleDirectoryMoveParams }
  | { kind: 'file'; params: HandleFileMoveParams }

switch (op.kind) {
  case 'directory':
    return handleDirectoryMove(op.params)
  case 'file':
    return handleFileMove(op.params)
}
```

**Evidence** (historical — non-null assertions resolved in #199): `content-ops/src/ops/movePathOps.ts` once modelled `MoveCtx` as `Partial<...>` with `ctx.source!` assertions at the two dispatch sites. #199 made `MoveCtx` a total type and dropped the assertions; a full discriminated-union rewrite was judged N/A here (the branch is unknown at ctx-build time). See Migration Plan below.

## Migration Plan (originating instances)

The concrete instances found while extracting these rules from the 2026-04-17 audit. All were resolved in #199, so they are recorded here as the rules' provenance rather than as open work.

| Rule | Location | Status |
| ---- | -------- | ------ |
| DR-1 | `content-ops/src/ops/copyPathOps.ts` (705 LOC) | Resolved in #199 — split into `copy-file` / `copy-directory` / `copy-directory-transforms` / `copy-types` + orchestrator |
| DR-1 | `apps/pair-cli/src/cli.e2e.test.ts` (1507 LOC) | Resolved in #199 — split into per-command e2e files + shared helpers |
| DR-1 | `packages/brand/dev/App.tsx` (456 LOC) | Resolved in #199 — sections extracted to `dev/sections/*` (App.tsx → 51 LOC) |
| DR-1 | `packages/content-ops/src/test-utils/in-memory-fs.ts` (429 LOC) | Resolved in #199 — split into state + read/write/seed modules |
| DR-2 | `packages/content-ops/src/markdown/link-processor.ts` (`class LinkProcessor`) | Resolved in #199 — converted to named function exports |
| DR-3 | `packages/content-ops/src/ops/movePathOps.ts` (`MoveCtx`) | Resolved in #199 — `MoveCtx` made total, `ctx.source!` assertions dropped (discriminated-union rewrite N/A) |

**Note**: these originating instances are cleared. New violations found by later audits are tracked as `tech-debt` Draft items (P1–P3) via `pair-capability-assess-debt` scan mode (#224), not appended here.

## Related

- [Technical Debt](../quality-standards/technical-debt.md) — how migration items are prioritized (P1–P3) and tracked
- [SOLID Principles](solid-principles.md) — DR-1 is the practical, evidence-backed form of Single Responsibility
- [Naming Conventions](../code-organization/naming-conventions.md) — DR-2 is a naming/module-shape convention violation
- [TypeScript](../framework-patterns/typescript.md) — DR-3 is a type-narrowing pattern (discriminated unions)
