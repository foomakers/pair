# /brainstorm — Parametrization Reference (level · orientation · phase-3 writer)

Reference file for [SKILL.md](SKILL.md) — read by **Step 0 item 4** on every run that carries a `$root`, and whenever a run has to explain or defend the deduced triple. `SKILL.md` states the precedence rule inline; this file is the **normative matrix** and its rationale.

## Orientation Matrix

Deduction inputs, in precedence order: **argument > tags > issue type**. The type decides the level **and** the phase-3 writer; tags decide the orientation and win over the type-derived default. **Most specific row wins**, and the tag row is a **modifier**, not a competing row: it flips the orientation and adds `/map-contexts`, leaving the level and the writer as the base row resolved them.

Every invocation matches **exactly one base row** — one of the three type rows, the **fallback row** (a `$root` whose type label is absent or unrecognized), or the no-`$root` row — so the modifier always has a base to modify, and there is no input for which level, orientation, and writer stay unresolved.

| `$root` signal                                        | Level      | Orientation | Phase 2 capability                                                              | Phase 3 writer (and the parent it receives)                                                                                                     |
| ----------------------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| type `initiative`                                      | broad      | functional  | `/map-subdomains`                                                               | `/plan-epics` with `$initiative: <the root>`                                                                                                     |
| type `epic`                                            | broad      | functional  | `/map-subdomains`                                                               | `/plan-stories` with `$epic: <the root>`                                                                                                         |
| type `story`                                           | punctual   | functional  | `/map-contexts`                                                                 | `/plan-stories` with `$epic: <the root's parent epic>` — sibling stories; the root itself enters the writer's registry as an **EXTEND target**    |
| **no recognized type** on `$root` (fallback)            | asked first (phase 1), exactly as on the no-`$root` path | functional, unless the tag modifier flips it | resolved once the level is answered: broad → `/map-subdomains`, punctual → `/map-contexts` | `/plan-stories` with `$epic: <the root's parent epic>` — an untyped root is treated as a **leaf, never a container**, so it enters the writer's registry as an **EXTEND target** exactly as a story root does. **Parent is an `initiative`** (an unlabelled epic-shaped container — a normal PM state): the root is container-shaped after all, so the writer is `/plan-epics` with `$initiative: <that parent>` — sibling epics, root still an EXTEND target — rather than a HALT; on this sub-case the level is still asked but **only sizes the discovery** — the tree is epics because the parent is an initiative, and the writer is never overridable (see [Level sizes, parent types](#level-sizes-parent-types)). **No parent at all** → **HALT** with both remedies named: label `#[ID]` with its real type and re-run, or `/plan-epics` to create the missing epic |
| any type or none + a `tech` / `tech-debt` / `infra` tag (modifier) | unchanged  | technical   | `/map-contexts` — **in addition to, and after**, the base row's capability when that row is broad | unchanged (the base row's)                                                                                                     |
| no `$root` (free theme)                                | asked first (phase 1) | `functional` unless `$orientation` or the tag modifier flips it | resolved once the level is answered: broad → `/map-subdomains`, punctual → `/map-contexts` | broad → `/plan-epics` with `$initiative: <the initiative the placement points to, confirmed>`; punctual → `/plan-stories` with `$epic: <the epic the placement points to, confirmed>` |

## Why a fallback row rather than a HALT

Type is a PM-tool **label**, so its absence is a normal state, not an error — refusing to run would make discovery unusable on any unlabelled issue. The fallback resolves conservatively (leaf, never a container) and stays overridable: the developer can label the issue or pass `$level` to short-circuit the question. A tag-only root (e.g. labelled `tech-debt` with no type) therefore still honours the `tech`/`tech-debt`/`infra` → **technical** deduction through the modifier row.

The one shape the leaf treatment cannot serve is an untyped root whose **parent is an initiative**: there is no parent epic to hang siblings from, and the root's position already says it is epic-shaped. That case resolves to `/plan-epics` under the parent initiative instead of HALTing — the label is missing, the structure is not.

### Level sizes, parent types

On that sub-case the level question is still asked (it is the fallback row), but **the answer cannot change what the tree contains**: the item type follows the resolved parent (`/plan-epics` under an initiative ⇒ epics), and the writer is never overridable (see [The triple is a proposal](#the-triple-is-a-proposal)). So answering "punctual — a single story" **sizes the discovery** — how wide the interview goes, how many slices come back — and still yields epic-sized candidates.

This matters for the common PM state the rationale above glosses over: a **mis-parented, unlabelled story** hung directly off an initiative, where "the root's position already says it is epic-shaped" is simply wrong. The structure is what brainstorm can read, so it follows the structure — and the remedy is the one Step 0's proposal already offers, stated there together with this consequence: **label the root with its real type and re-run** (then it matches the `story` row: sibling stories under its parent epic). Passing `$level` does not substitute for the label.

## Why the writer keys on type, not on level

The **level sizes the discovery** — how wide the interview goes, how many slices the tree carries — while the **root's type selects the writer**, because a writer's parent must sit exactly one level above what it writes: `/plan-epics` can only hang epics off an **initiative**, `/plan-stories` only stories off an **epic**. So a broad discovery rooted on an epic still lands as stories (many of them), never as sub-epics.

## The triple is a proposal

The deduced triple (level, orientation, writer) is always **stated up-front** and is a proposal: the developer can override level or orientation in the same turn (equivalently, by passing `$level` / `$orientation`) — the writer follows from the root's type and the resolved level, never from an override of its own.
