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

**Evidence**: #199 P0.5 `copyPathOps.ts` (705 LOC / 19 functions) · P0.3 `cli.e2e.test.ts` (1507 LOC, one file per CLI command instead) · P2.2 `dev/App.tsx` (456 LOC / 11 inline sections) · P2.3 `in-memory-fs.ts` (429 LOC) — recurring cluster in `content-ops/src/ops/` (4 of the audit's top-10 largest files). See Migration Plan below for per-instance priority.

## DR-2 — Static-Only Namespace Class

**Don't**: wrap a set of stateless functions in a `class` used only for its `static` methods. It adds ceremony (import the class, call through it) without adding behavior — no instance, no state, no polymorphism.

**Recognition**: a class where every method is `static` and no instance property/state exists — it's a namespace pretending to be an object.

```typescript
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

**Evidence**: #199 P0.4 `markdown/link-processor.ts:42-411` — `class LinkProcessor` with 18 static methods; the fix direction was already emerging in the file's own compat re-exports (`link-processor.ts:409-418`, standalone `extractLinks`/`detectLinkStyle` functions wrapping the static calls). See Migration Plan below.

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

**Evidence**: #199 P1.3 `content-ops/src/ops/movePathOps.ts:189` (`MoveCtx = Partial<...>`) with non-null assertions at the two dispatch sites (`movePathOps.ts:157-158`, `172-173`). See Migration Plan below.

## Migration Plan (existing violations)

Current, concrete instances found while extracting these rules from #199 — not blocking, tracked as tech-debt. This list is the seed for `pair-capability-assess-debt` scan mode (#224): it converts findings like these into `tech-debt` Draft items (P1–P3) so they live in the backlog instead of only in this doc.

| Rule | Location | Priority | Note |
| ---- | -------- | -------- | ---- |
| DR-1 | `content-ops/src/ops/copyPathOps.ts` (705 LOC) | P1 | split per #199 suggested execution: `copy-file.ts` / `copy-directory.ts` / `copy-orchestrator.ts` |
| DR-1 | `apps/pair-cli/src/cli.e2e.test.ts` (1507 LOC) | P1 | split per CLI command (install / update / kb-validate / update-link) |
| DR-1 | `packages/brand/dev/App.tsx` (456 LOC) | P2 | dev-only harness; extract sections to `dev/sections/*` |
| DR-1 | `packages/content-ops/src/test-utils/in-memory-fs.ts` (429 LOC) | P2 | test-only; split read/write/seed helpers |
| DR-2 | `packages/content-ops/src/markdown/link-processor.ts` (`class LinkProcessor`) | P1 | convert to named exports; re-exports already exist for the compat path |
| DR-3 | `packages/content-ops/src/ops/movePathOps.ts:189` (`MoveCtx`) | P2 | opportunistic, when the file is next touched |

## Related

- [Technical Debt](../quality-standards/technical-debt.md) — how migration items are prioritized (P1–P3) and tracked
- [SOLID Principles](solid-principles.md) — DR-1 is the practical, evidence-backed form of Single Responsibility
- [Naming Conventions](../code-organization/naming-conventions.md) — DR-2 is a naming/module-shape convention violation
- [TypeScript](../framework-patterns/typescript.md) — DR-3 is a type-narrowing pattern (discriminated unions)
