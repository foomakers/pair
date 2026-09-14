# Decision: a quality gate imports the generator it checks by SOURCE path, and the generator hands it a read-only file-system slice

## Date

2026-09-01

## Status

Active

## Category

Convention Adoption

## Context

Story #416 adds the gate that keeps `.pair/llms.txt` equal to what `generateLlmsTxt`
emits. Refinement had already settled *where* the check lives — beside the sibling
gates in `packages/dev-tools/src/quality-gates/`, so `quality-gate` composition stays
uniform — and *what* it compares — the transform's output, per
[`2026-08-11-a-mirror-guard-compares-the-transform.md`](./2026-08-11-a-mirror-guard-compares-the-transform.md).

What it did not settle is the mechanism, and the mechanism is where the two real
risks live:

1. **How does `@pair/dev-tools` reach a generator that lives in `apps/pair-cli`?**
   `@pair/pair-cli` publishes `dist/index.js` and exports only `version` from it; the
   registry is reachable inside the app through its `#registry` subpath imports, which
   are private to that package. There was no exported route to `generateLlmsTxt`.
2. **What stops the check from becoming a fixer?** The check-only rule
   ([`2026-07-31-pre-push-gate-is-check-only.md`](./2026-07-31-pre-push-gate-is-check-only.md))
   is stated in prose, and the module that computes the expected index sits one import
   away from `writeProjectLlmsTxt` — the function that would silently "fix" the drift
   the gate exists to reveal. A guard whose only protection against writing is the
   author's restraint is one autocomplete away from failing open.

The DoD constraint framing both: **one** definition of the index format. Any answer
that copies the generator, or re-derives the format from the tracked file, is out.

## Decision

**Two rules, adopted together.**

**1. A gate imports the artifact-producing code by SOURCE path, not through a package
entry point.** `llms-txt-drift-check.ts` does
`import { generateLlmsTxt } from '../../../../apps/pair-cli/src/registry/llms-generation'`.
The gate reads the same TypeScript the CLI compiles, so the generator has exactly one
definition and a change to it surfaces in the gate immediately — no rebuild, no
publish, no re-export whose only consumer is a dev script.

Three mechanical consequences, all handled here rather than left to be rediscovered:

- **`@pair/dev-tools` sets `"composite": false`.** This is what the source import
  actually costs, and it was NOT free: with `composite` inherited from
  `@pair/ts-config/base.json`, `tsc` rejected the import outright — `TS6059` (the
  imported file "is not under `rootDir`") and `TS6307` ("not listed within the file
  list of project"). Both are **emit-time invariants**, and `@pair/dev-tools` emits
  nothing: it has no `build` script, its `ts:check` is `tsc --noEmit`, and no tsconfig
  in the repo references it. `composite` there was inert cargo from the shared base,
  enforcing `rootDir` on a project with no output. Turning it off for this one package
  states the truth (a scripts package, not a build target) instead of bending `rootDir`
  to admit the reach-in. The rationale is repeated at the edit site, in
  `packages/dev-tools/tsconfig.json`, because that is where the next person meets it.
- `@pair/content-ops` is now a **devDependency of `@pair/dev-tools`**, though no
  dev-tools source imports it. The source import pulls `llms-generation.ts` into
  dev-tools' `tsc` program, and its sibling `writeProjectLlmsTxt` types against
  `FileSystemService`. Without the declared dependency, turbo has no `^build` edge from
  `@pair/dev-tools#ts:check` to `@pair/content-ops#build` and the two RACE — observed:
  `dev-tools:ts:check` starting before `content-ops:build` finished, green only by
  luck. The dependency is what makes the ordering a graph edge instead of a coin flip.
- `ts-node`/vitest compile the imported source directly because it is reached by a
  relative path, not through `node_modules` (which `ts-node` ignores by default).
- **The gate's own script runs `ts-node -T` (transpile-only).** Type-checking the
  imported source at GATE-RUN time made the gate's verdict depend on whether someone
  had built a sibling package: `llms-generation.ts`'s first line imports
  `@pair/content-ops` TYPES, which exist only in `dist/`. Reproduced on this branch by
  moving `packages/content-ops/dist` aside — `pnpm llms-index:check` produced none of
  its three outcomes and died with
  `../../apps/pair-cli/src/registry/llms-generation.ts(1,40): error TS2307: Cannot find module '@pair/content-ops'`
  plus a ts-node stack, exit 1. The same command with `-T` printed
  `✓ llms-index: .pair/llms.txt matches the generator` on that same unbuilt tree.
  Nothing is lost: type-checking that source belongs to `ts:check` in BOTH packages,
  and `turbo ts:check` is the task that carries the `^build` edge (which is also why
  the `@pair/content-ops` devDependency below stays — it orders `ts:check`, and only
  `ts:check`). The rejected alternative was to make `llms-index:check` a turbo task
  with `"dependsOn": ["^build"]`: it restores ordering but puts a repo-wide guard
  behind turbo's cache, whose key is package-scoped — the stale-PASS trap this
  repo's `turbo.json` already documents twice — so it would need `cache: false` or a
  `$TURBO_ROOT$/.pair/**` inputs list, i.e. more machinery for a property `-T`
  gives for free.

**2. Code invoked BY a gate takes the narrowest file-system capability it needs.**
`generateLlmsTxt`'s parameter changed from `FileSystemService` (30 members, including
`writeFile`, `rm`, `chmod`) to `LlmsSourceFs` — a 3-method read-only interface
(`exists`, `readdir`, `readFile`) declared next to it. The gate passes its own
`readOnlyFileSystem` adapter, which has no write primitive to call. "This gate cannot
write the file it judges" becomes a type fact instead of a review promise. Existing
callers are untouched: `fileSystemService` satisfies the narrower interface
structurally.

## Alternatives Considered

- **Add an `exports` map to `@pair/pair-cli` and import `@pair/pair-cli/registry`**:
  turns a dev-tooling need into a **public API change on a published package** (`"private": false`),
  and binds the gate to `dist/` — so the check reports drift against the LAST BUILD, not
  against the working tree. A generator edit without a rebuild would pass green. Rejected.
- **Leave the byte-equality guard where #216 put it** (`apps/pair-cli/src/registry/llms-index-conformance.test.ts`,
  a vitest case over the real repo tree): it satisfies AC1 and nothing else. Its failure
  is a raw string diff over a 400-line file — the experience AC2 rejects by name — it
  names no regeneration command, and being a cacheable `turbo test` input that lives
  entirely inside `apps/pair-cli`, a KB-only change replays a cached PASS. Replaced, not
  duplicated (the file keeps its non-drift assertions about what the generator must index).
- **Move `generateLlmsTxt` into `@pair/content-ops`** (a workspace library both packages
  already depend on) and import it as `@pair/content-ops/kb-index`: no `composite` change,
  a clean package boundary, and genuinely the tidier long-term home for a
  filesystem-scan-to-markdown transform. Rejected on the property that matters most to a
  DRIFT gate: `@pair/content-ops` is consumed through `dist/`, so the gate would compare
  `.pair/llms.txt` against the LAST BUILD of its generator. Inside `pnpm quality-gate` that
  is safe (`turbo ts:check` pulls `^build` first), but the root step is also runnable on its
  own — `pnpm llms-index:check` — and there it would silently judge the working tree with a
  stale generator. A gate whose verdict depends on whether someone rebuilt is the failure
  class this story exists to close. Worth revisiting only if the generator acquires a second
  non-gate consumer.
- **Keep `composite` and widen `rootDir`** on `@pair/dev-tools` (e.g. `"rootDir": "../.."`):
  makes the error go away while asserting something false — that this package emits, rooted
  at the repo. It also leaves `TS6307` to be silenced separately. Rejected: the honest fix is
  to stop claiming a non-emitting package is a build target.
- **Re-implement the index format in the gate**: two definitions of `llms.txt` that drift
  apart — the exact failure the story exists to prevent. Rejected by DoD.
- **Keep `FileSystemService` and rely on the prose rule not to write**: cheaper by one
  interface, and it leaves the strongest guarantee in the story (the gate never writes)
  resting on nothing enforceable.
- **Move `writeProjectLlmsTxt` to its own module** so the generator carries no
  `@pair/content-ops` type at all, dropping the devDependency: a genuinely cleaner split,
  but it edits the install/update handlers and an existing test on a story whose whole
  point is a gate. Deferred — the devDependency costs one line and no behaviour.

## Consequences

- The gate compiles the CLI's source; a compile error in `llms-generation.ts` now also
  reddens `@pair/dev-tools#ts:check`. That is the intended coupling — one definition —
  and it is confined to that one module.
- `@pair/dev-tools` gains a devDependency it does not import. **It is load-bearing for
  build ORDER, not for resolution** — this ADL is where that non-obvious fact is
  recorded, and the module header points here.
- **`@pair/dev-tools` no longer participates in project references.** Nothing referenced
  it, so nothing breaks today; the cost lands the day this package acquires a `build`
  script — whoever adds one must restore `composite` and, with it, deal with the source
  import (most likely by taking the `@pair/content-ops` route rejected above, which by
  then would have a second consumer to justify it). The tsconfig comment says so at the
  edit site.
- Dropping `composite` removes the compiler's objection to ANY cross-package source
  import from this package, not just this one. The boundary is now a convention rather
  than a type error: `@pair/dev-tools` is where the repo's gates live, and a gate reading
  the source it judges is its job — but a second reach-in should be argued, not assumed
  legal because the first one was.
- The narrowing is the reusable half: the next gate that runs production code over a
  tree it must not modify asks for a read-only slice rather than the whole service.
- The REMEDY the gate prints (`pnpm llms-index:regen`, ADL
  [2026-09-03-a-gate-names-a-remedy-it-can-run.md](./2026-09-03-a-gate-names-a-remedy-it-can-run.md))
  reuses both halves of this decision — same source import, same `-T` — and declares its
  extra power as a separate two-method `LlmsIndexSink` rather than widening
  `LlmsSourceFs`. The type distinction between the checker and the writer is the point:
  the check still has no write primitive to call, and the writer is the only module in
  the folder that does.
- The relative import hardcodes a `../../../../apps/pair-cli/...` hop. Moving either
  package breaks it loudly at compile time (not silently at runtime), which is the
  acceptable failure mode; `repo-root.ts` already carries the folder's other hop count.

## Adoption Impact

- `adoption/tech/way-of-working.md` — the Quality Gates section gains the `llms-index`
  gate (what it checks, the command, check-only).
- No `tech-stack.md` change: no new dependency enters the project. `@pair/content-ops` is
  an existing workspace package, newly declared by one more workspace member.
- No ADR: this changes no service boundary or architectural pattern — it is the
  convention for how a gate reaches the code it checks, and what capability that code is
  handed.
