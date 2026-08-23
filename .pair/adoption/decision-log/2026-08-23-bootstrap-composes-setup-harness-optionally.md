# Decision: bootstrap composes setup-harness, optionally

## Date

2026-08-23

## Status

Active

## Category

Process Decision

## Context

Story #450 (agent-harness setup) ships `/pair-capability-setup-harness` (T-9) as a distributed **product capability** — authored in the dataset (`packages/knowledge-hub/dataset/.skills/capability/setup-harness/`) and mirrored to all 6 skill targets, same shape as `/pair-capability-setup-pm` and `/pair-capability-setup-gates`. It is not a config specific to this repo; any project that installs pair gets it.

A pre-implementation grill session (developer request, 2026-08-23) raised whether this framing was sufficient: "pi va integrato in pair come capability del prodotto non nel solo progetto, poi il progetto è una conseguenza." Two points were checked against the story's actual scope:

1. Is the skill already product-scoped rather than project-scoped? — **Yes**, confirmed against T-9's `SKILL.md` target list.
2. Should `/pair-process-bootstrap` (the end-to-end new-project setup orchestrator) also compose it, the way it composes `/pair-capability-setup-pm`? — Not in the story's original task list. `/pair-process-bootstrap` today composes `/pair-capability-setup-pm` as **Required** in its finalization phase, but does not compose `/pair-capability-setup-gates` or any assess-* skill unconditionally (those are optional, invoked only when installed, per its own Composed Skills table).

## Decision

`/pair-process-bootstrap` will compose `/pair-capability-setup-harness` in its finalization phase, as an **optional** step — analogous to how it treats `assess-*` skills (proposed, skippable, graceful-degradation if not installed) rather than as a `/pair-capability-setup-pm`-style required step.

Rationale: most projects stay on the harness already in use by their developer (frequently Claude Code) and never need to declare anything in `tech/automation.md` — the zero-configuration path is a first-class outcome (AC6 of #450), not a fallback. Forcing every bootstrap run to resolve a harness explicitly would contradict that path and add friction to the common case.

**Follow-up question during the same session**: should `pair-assistant` (the Claude Code marketplace plugin's entry-point skill, `packages/knowledge-hub/dataset/plugin/skills/pair-assistant/SKILL.md`) or `pair-cli` also be extended to install/configure a harness? Resolved as follows:

- **`pair-cli`: no.** The story's Technical Analysis states the strategy is "KB content plus one skill; zero application code" and Business Rule 4 ("if it requires code, the framework is wrong"). Provisioning is the skill's job, matching `setup-pm`/`setup-gates`, neither of which has a CLI subcommand counterpart.
- **`pair-assistant`: no mechanism change, one discoverability row.** `pair-assistant` exists only in the Claude Code plugin channel (its own file: "This assistant exists only in the plugin") — pi and opencode never go through it; they read `.claude/skills/` and `.agents/skills/` directly per ADR-005. Its Step 6 already dispatches to any installed skill "by bare name" once `/pair-capability-setup-harness` exists in the catalogue, so no structural change is needed. A one-row addition to its "Intent → where the answer lives" table (mapping "configure this project for pi/opencode" → `/pair-capability-setup-harness`) is added for discoverability only.

This is a scope extension of story #450's T-9 (way-of-working: "implementation never files a card, it extends the story" — [2026-08-12-implementation-never-files-a-card-it-extends-the-story.md](2026-08-12-implementation-never-files-a-card-it-extends-the-story.md)), not a new card.

## Alternatives Considered

- **Required composition, same as `/pair-capability-setup-pm`**: rejected — would force every new project through an explicit harness decision even when the implicit default (stay on the current harness) is correct and sufficient, contradicting AC6's zero-configuration guarantee.
- **No bootstrap composition at all (standalone-only, like `/pair-capability-setup-gates` today)**: considered acceptable but rejected in favor of surfacing the capability during onboarding — a developer who does not already know `/pair-capability-setup-harness` exists would otherwise never discover it.

## Consequences

- `/pair-process-bootstrap`'s `SKILL.md` gains `/pair-capability-setup-harness` in its Composed Skills table (Optional), and a step in the finalization phase that offers it, mirroring the existing optional-composition pattern already used for assess-* skills.
- No change to `/pair-capability-setup-harness` itself — it remains fully invocable standalone, unchanged in shape.
- `tech/automation.md`'s zero-configuration path (AC6) stays the default outcome of a bootstrap run that declines the harness step.

## Adoption Impact

None to this repo's own adoption files — `bootstrap` already ran for `pair` itself; this decision changes the **dataset skill's** composition behavior for future/other projects' bootstrap runs, implemented directly in story #450's T-9 (dataset `SKILL.md` files), not in `.pair/adoption/**`.
