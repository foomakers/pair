# Decision: `run --root --parallel` ports `pair-loop`'s dependency + mutex analysis under a parity test, selects through one `pair-next` engine process, and locks mutex resources through `card-lock`

## Date

2026-09-23

## Status

Active

## Category

Architecture Pattern Adoption

## Context

Story #491 adds a portable fan-out to `pair-cli run`: a dependency- and mutex-safe batch of cards, each run as its own `pair-cli run --card` process (#487). Its technical spike (T-1) had to decide how `pair-cli` reuses `pair-loop`'s analysis, and the story names the split (491-A/491-B) as the fallback if the extraction proves invasive.

Facts that decided it:

- `.claude/workflows/pair-loop.js` is a Workflow script. Its pure helpers sit above top-level orchestration statements (`validateArgs(args)`, `agent()`, `workflow()`), so importing it as a module executes the orchestration; an installed CLI also does not ship `.claude/workflows`.
- The repo already solves the same problem for `tech/automation.md`'s grammar: `tier-parity.test.ts` evaluates tier 1's own helper half (everything above the `// ORCHESTRATION` marker) and runs it against the TS port over one corpus (ADR-021 tier 2).
- `pair-loop`'s Select phase is an agent that runs `/pair-next` and returns per-candidate prerequisites (merged status), touched surface as mutex resources, tier, title, branch. The portable driver has no `agent()`, only engine processes.
- `card-lock` locks one card id (a safe id, used as a directory name); mutex resources are free strings (paths, skill names).

## Decision

1. **Port, parity-tested — no split.** `root-plan.ts` ports `resolveCards`, `dependencyFilter`, `computeMutexBatch` (no overrides: this mode takes none) and `resolveMaxParallelism`; `root-plan.test.ts` evaluates tier 1's source over a shared corpus, so a divergence fails on whichever side moves first. `## Max Parallelism` per-tier overrides are now exposed by `readAutomationPolicy` (`maxParallelismOverrides`) and applied exactly as tier 1 does.
2. **Over-cap cards are queued, not excluded.** Tier 1 defers an over-cap card to a later iteration; the pool starts it when a slot frees, so `--parallel 1` runs the plan sequentially. Mutex-conflicting and dependency-blocked cards stay excluded with tier 1's own reason.
3. **Selection is one fresh engine process running `pair-next --root`** (plus `--filter <## Eligibility>` when declared, as tier 1 does), asked the same data questions tier 1's Select phase asks, answering on one `PAIR-ROOT-CANDIDATES: {json}` line (line-anchored, most recent wins — the `CONTINUE-TOKEN:` idiom). The payload is untrusted: ids must pass `isSafeId` (argv + lock path), labels must be forwardable as `--card-tags`.
4. **Mutex resources are locked through `card-lock`'s own acquirer**, keyed `mutex-<sha256[0..16]>`, all-or-nothing, held by the parent for the life of the card's process. The card's own lock stays the child's (`run --card`), so the parent never takes it. Within one batch the plan already keeps conflicting cards apart; the lock carries the guarantee across concurrent `--parallel` runs.
5. **Children are self-invocations** (`process.execPath` + `execArgv` + `argv[1]`), forwarded only the card, its observed labels and the operator's own opt-ins; tracked through `interrupt.ts` so a signal reaches them.

## Alternatives Considered

- **Import `pair-loop.js` / extract a shared module both import**: `pair-loop.js` executes its orchestration at top level (so importing it runs it) and the CLI does not ship it; a shared module both import would restructure the tier-1 workflow file itself. The parity test gives the same no-drift guarantee without touching tier 1.
- **Invoke the analysis as a JSON-in/JSON-out script**: needs an installed script path and a second runtime boundary for four pure functions.
- **Read candidates from `gh` directly**: would move selection out of `pair-next` (AC7, ADR-017 §1).
- **A new resource-lock implementation**: AC3 forbids it; the digest key keeps `card-lock`'s exclusive-`mkdir` semantics unchanged.

## Consequences

- A change to tier 1's dependency/mutex helpers fails `root-plan.test.ts` until the port follows.
- Tier 2 accepts a per-tier override key the Tag Projection does not emit (shape-only validation, as before); with `## Eligibility` declared the batch tier is the eligibility label, so such a key is never the one applied.
- A stale `mutex-*` lock left by a SIGKILLed parent is cleared like any stale card lock (the path is printed in the `skipped` detail).
