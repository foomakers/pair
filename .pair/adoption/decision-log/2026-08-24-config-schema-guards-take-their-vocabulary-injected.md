# Decision: a `pair.config.json` schema guard stays in `#config` and takes its vocabulary INJECTED, never imported from the command layer

## Date

2026-08-24

## Status

Active

## Category

Convention Adoption

## Context

US-451 added an optional `engine` block to `pair.config.json` (`{"engine": {"id": "pi"}}`). Its task
breakdown said "extend `LoadedConfig` with an optional engine field and add a `FieldGuard` alongside
the existing guards in `config/loader.ts`" — which reads naturally until you ask **where the set of
valid engine ids lives**.

`apps/pair-cli` has a stable internal layering, expressed as import aliases: `#config` and
`#registry` are imported **by** `src/commands/*`, never the reverse. The engine map that defines
which ids exist (`commands/run/engines.ts`) is command-layer data — deliberately, because it also
carries per-engine argv, autonomy posture and terminal-event rules, none of which the config layer
has any business knowing.

A guard written literally as instructed had two ways to reach that vocabulary, and both are wrong:

- `config/loader.ts` imports `commands/run/engines` — inverts the dependency, and drags the whole
  engine surface (spawn flags, trust postures) into the layer that only needs a list of names;
- `config/loader.ts` re-declares the ids — a second source of truth for "which engines exist",
  which drifts silently the first time an engine is added (the config layer would accept an id the
  driver cannot run, or reject one it can).

The existing `FIELD_GUARDS` in `loader.ts` are also not the same mechanism: they are the allowlist
for what a **remote source KB** may declare about a registry entry (US-396, layer 2 of the
resolution). The `engine` block is a top-level key of the **consuming project's own** config, and
nothing about it is source-declarable. Reusing that table would have conflated two different trust
boundaries.

## Decision

1. **The guard lives in its own `#config` module** — `apps/pair-cli/src/config/engine-block.ts`,
   exporting `readEngineDeclaration(config, knownEngineIds)` — not inside `loader.ts`'s
   source-declaration guards, whose subject is a different trust boundary.
2. **Its vocabulary is a parameter.** The caller passes the known ids in
   (`readEngineDeclaration(loaded.config, ENGINE_IDS)`); the config layer stays engine-agnostic and
   holds no engine name at all. This is the same shape D18 already imposes on classification tags:
   *no tag name is ever hardcoded in a skill or module — the label is adoption data, and the code
   carrying it stays tag-agnostic.* The layering rule and the D18 rule point the same way here.
3. **Both readers compose it**: `commands/run/handler.ts` (which then resolves precedence
   `--engine` > `pair.config.json` > schema default) and `commands/validate-config/handler.ts`
   (which surfaces the errors in the same pass as the registry ones). Two callers, one guard.
4. **The schema key itself is declared where the schema lives** — `engine?: { id: string }` on
   `Config` in `registry/resolver.ts`, beside `working_path` and `link_validation`, so the config
   shape stays readable in one place.
5. **A malformed block is an error, never a silent drop to the default** (unknown id, non-object
   block, unknown field). An operator whose typo was ignored could not tell a working configuration
   from a broken one.

## Alternatives Considered

- **Guard inside `loader.ts` importing the engine map** — rejected: inverts `#config` ← commands.
- **Duplicate the id list in `#config`** — rejected: two sources of truth for the same vocabulary.
- **Move the engine map down into `#config`** — rejected: the map is not only names; it carries
  spawn argv, autonomy/trust postures and terminal-event rules, which is command-layer knowledge and
  is itself destined for the KB later (ADR-021 Trade-offs).
- **Validate nothing and let the driver fail at spawn time** — rejected: `pair validate-config`
  exists precisely so a config error is found before a run, and an unattended run is the worst place
  to discover one.

## Consequences

- The stated task wording ("guard in `loader.ts`") is **not** what shipped; this ADL is the record
  of why, so the next reader does not treat the deviation as an oversight.
- Adding an engine stays a **one-place** edit (`commands/run/engines.ts`): the guard, the CLI and
  `validate-config` all follow from the injected list.
- `readEngineDeclaration` is trivially unit-testable with an arbitrary id list, with no engine-map
  fixture and no command-layer import in the test.
- The rule generalises: **any future top-level `pair.config.json` key whose valid values are defined
  by a higher layer gets the same treatment** — guard in `#config`, vocabulary injected.
- Cost: one indirection (the caller must pass the list). Accepted — it is what keeps the dependency
  arrow pointing one way.

## Adoption Impact

- `.pair/adoption/tech/architecture.md` — **update required, tracked as a follow-up, not done here**:
  the file describes the monorepo's package boundaries but never `apps/pair-cli`'s internal module
  layering (`#config` / `#registry` imported BY `src/commands/*`, never the reverse), which is the
  rule this decision applies. Adding a short subsection there is the natural home for it; this ADL
  is the interim record and the reason the deviation from US-451's stated task wording is deliberate.
- `.pair/adoption/tech/tech-stack.md` — no change: no dependency is added or removed.
- `.pair/adoption/tech/way-of-working.md` — no change: no process changes; the existing
  "gate/tooling code lives in tested modules" convention already covers where the guard's tests go.

## Related

- [ADR-021](../tech/adr/adr-021-fan-out-three-realizations.md) — the driver this key configures, and
  the recorded intent to move the engine map to the KB later.
- [ADR-014](../tech/adr/adr-014-tool-package-boundary-by-bounded-context.md) — package boundaries by
  bounded context; this ADL is the same instinct applied inside one app's module layering.
- `tech/architecture.md` — does not currently describe `apps/pair-cli`'s internal layering
  (`#config`/`#registry` ← commands). Documenting it there is a **follow-up**, not part of this
  decision; this ADL is the first written record of the rule.
- US-451 ([#451](https://github.com/foomakers/pair/issues/451)) — T-3, and review round 1 finding 6,
  which asked for exactly this record.
