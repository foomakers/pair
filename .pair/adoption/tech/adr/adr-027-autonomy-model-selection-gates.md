# ADR-027: Autonomy model — selection, target and two gates, resolved by one function

## Status

Accepted (story #521, epic #485). **Revises ADR-013 Q2b** (eligibility is an any-of `filter`, no longer one tier label), **amends ADR-017 §1** (`pair-next` gains `--assignee`/`--status`; `--filter` is any-of), **supersedes** decision-log `2026-08-20-eligibility-is-one-literal-label-until-the-filter-widens`.

## Date

2026-09-30

## Context

- `## Eligibility` (one literal label) and `## Auto-Advance` (a tier switch) grew as two special cases of one need: which cards an unattended run works on, how far it takes them, and when it must hand back to a human.
- Merge authority (Core subdomain) must not widen silently: default behaviour stays "nothing new merges".
- The 2026-08-20 log demanded that the filter widen in `pair-next --filter` first, before any boolean grammar; this story is that widening.
- `pair-implement-batch` and `pair-loop` keep today's behaviour here (A2, #524, makes the batch honour the model).

## Options Considered

### Option 1: Boolean expression grammar (`--auto-merge-when '<expr>'`)

- **Pros**: expressive.
- **Cons**: a second grammar to parse, validate and keep identical in script, CLI and skill; label semantics leak into code (D18).

### Option 2: Per-workflow flags

- **Pros**: local.
- **Cons**: every consumer re-derives the rule; drift between cycle, `run`, `pair-next`.

### Option 3: A dedicated eligibility tag

- **Pros**: one label.
- **Cons**: writes a tag onto cards (rejected by ADR-013 Q2b); an AND is better synthesised upstream by a classification tag (Tag Projection).

### Option 4 (chosen): opaque any-of lists + two same-shaped gates + `until`

## Decision

- Keys: `filter` (any-of labels), `assignee` (`@me` or a login), `status` (macrostates), `root`, `until` (`ready | pr | merged`), `prepare` and `merge` gates `<always|never|when>[; has: <labels>][; lacks: <labels>]` (`has`/`lacks` only with `when`).
- Declared once in `tech/automation.md` `## Autonomy` or passed per invocation. Precedence **argument > adoption > KB default** (ADR-013 cascade); every run prints each effective value and its source.
- ONE shared function (`autonomy-policy.mjs`: `parse`, `resolvePolicy`, `decide`) owns grammar, legacy translation and the decision `proceed | await-human | escalate | stop-at-target`. `cycle-state.mjs`, `cycle-merge.mjs` and `pair-cli run` call it; none re-derives it.
- Labels are opaque strings, exact equality, lists any-of; an AND is a synthesised classification tag.
- The merge gate is evaluated only under `until: merged`, and only replaces the tier-membership check: head = `reviewedHead`, `pair-review`, `pair-explicit-approval` and the tier gate set stay mandatory. Escalation (a `when` condition fired at a stage boundary) wins over `never`/`when` proceed: status `escalated`, exit 1, `on-halt`, one marker-keyed card comment; the PR stays open. `escalated` is distinct from the batch row status `escalate`.
- Legacy: `## Eligibility <l>` = `filter: <l>`; `## Auto-Advance (none)` = `merge: always`; `## Auto-Advance <tier>` = `merge: when; lacks: <tier>` with `until: merged` when none is declared. Old HALTs kept; a differing `## Autonomy` coexisting with a legacy section HALTs, an identical one warns. `cycle-merge.mjs --autoAdvance` stays accepted (pair-loop's call unchanged).
- `prepare` is parsed and validated but not executed (treated as `always`) until #523.
- Batch and loop refuse `## Autonomy` / new arguments (`autonomy-not-supported-until-#524`).

## Consequences

### Benefits

- One rule, three consumers, printed precedence; default-off byte-identical (merge canary 0 diffs).

### Trade-offs and Limitations

- `escalated` is derived live from current labels (comment = durable record), not a stored handoff.
- Consumers assuming a single label (`pair-loop` tier check, docs) are inventoried and refused, not migrated, until #524.

## Adoption Impact

- `.pair/adoption/tech/adr/adr-013-*.md`, `adr-017-*.md` Status lines; decision-log 2026-08-20 marked superseded.
- KB `automation-policy.md` (`## Autonomy` schema), `collaborative-workflow.context.md` terms.
