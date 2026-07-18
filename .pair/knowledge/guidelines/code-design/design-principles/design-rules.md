# Design Rules

## Overview

Evidence-based do/don't rules for patterns that repeatedly show up as tech-debt in codebase audits — the ones an AI assistant tends to (re)generate unless explicitly constrained. Each rule: **recognition** (how to spot it), **alternative** (what to do instead). No separate anti-pattern catalog — these rules live here, in the code-design guidelines, and are consolidated as new evidence appears.

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

## DR-4 — Split Files Without a Barrel

**Don't**: split a god module (DR-1) into several sibling files that are only ever consumed together through a single entry point, and leave them as loose files in the parent directory. The directory listing grows noisy and a reader can't tell at a glance which of the siblings is the actual public API versus internal-only support files.

**Recognition**: a group of files in the same directory where exactly one function/class is imported by anything outside the directory, and the rest are internal collaborators imported only by that one entry point or by each other.

```typescript
// ops/
//   widget-orchestrator.ts   <- the only export consumed outside ops/
//   widget-validation.ts    <- internal-only, imported by widget-orchestrator.ts
//   widget-transform.ts     <- internal-only, imported by widget-orchestrator.ts
//   widget-types.ts         <- internal-only, shared types
```

**Do**: group the split files in their own folder with an `index.ts` barrel that re-exports exactly what's externally consumed today. From the caller's side nothing changes (same import path, now resolving to the folder); the directory now signals which files are the public surface (the barrel) versus internal implementation.

```typescript
// ops/widget/
//   index.ts              -> export { widgetOrchestrator } from './widget-orchestrator'
//   widget-orchestrator.ts
//   widget-validation.ts
//   widget-transform.ts
//   widget-types.ts
```

## Related

- [Technical Debt](../quality-standards/technical-debt.md) — how migration items are prioritized (P1–P3) and tracked
- [SOLID Principles](solid-principles.md) — DR-1 is the practical, evidence-backed form of Single Responsibility
- [Naming Conventions](../code-organization/naming-conventions.md) — DR-2 is a naming/module-shape convention violation
- [TypeScript](../framework-patterns/typescript.md) — DR-3 is a type-narrowing pattern (discriminated unions)
- [File Structure](../code-organization/file-structure.md) — DR-4 is a directory/module-grouping convention, applied at the split-file level
