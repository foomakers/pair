---
name: pair-process-brainstorm
description: "Runs discovery in three fixed phases — grill interview, domain integration, backlog tree triage — on a free theme or an existing `$root` issue, landing an integrated Draft epic/story tree while leaving the PRD untouched. Invoke to open a new feature area or to deepen an existing epic/story ('brainstorm the notifications area', 'explore what is missing under #205'); level (broad/punctual) and orientation (functional/technical) are deduced from the root's type and tags, or asked as the first interview question when no root is given (or its type label is unrecognized). Composes /pair-capability-grill, /pair-capability-map-subdomains, /pair-capability-map-contexts, /pair-process-plan-epics, /pair-process-plan-stories."
version: 0.1.0
author: Foomakers
---

# /pair-process-brainstorm — Structured Discovery (3 phases)

Turn a rough theme — or an existing epic/story — into an **integrated Draft tree** in the backlog, through three phases: **interview → domain → triage**. **Phase order is fixed**, and each phase's output feeds the next: the interview's raw requirements blob is what the domain phase places, and the placed result is what the triage phase slices into issues. The **PRD is never modified** — discovery lands in the backlog and in domain context files, not in the product vision.

Discovery is **parametrized**, not a fixed script: with `$root` the level, the orientation, and the phase-3 writer are deduced from the root issue's type and tags (or asked, when the root carries no recognized type label — the matrix's fallback row); without it, the level is the first question asked. **Per-phase idempotency** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) and the itemized resume list in [resume.md](./resume.md): each phase checks its own output before acting, so a re-run resumes at the first unfinished phase (an interrupted interview resumes from its `.pair/working/` handoff) instead of re-interviewing, re-placing, or re-triaging.

Discovery is also the **only** new process skill (D24): every phase delegates to existing capabilities — brainstorm owns the phase order, the parametrization, and nothing else.

## Composed Skills

| Skill             | Type       | Required                                                                                                                                                          |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/pair-capability-grill`          | Capability | Yes † — phase 1 interview (raw requirements blob). If not installed, warn and run the interview inline: one question per turn, each with a recommendation.           |
| `/pair-capability-map-subdomains` | Capability | Optional — phase 2 placement for a **broad** discovery: functional, and alongside `/pair-capability-map-contexts` when technical. Scoped. If not installed, warn and skip domain placement. |
| `/pair-capability-map-contexts`   | Capability | Optional — phase 2 placement for a **punctual or technical** discovery, scoped. If not installed, warn and skip context mapping.                                    |
| `/pair-process-plan-epics`     | Process    | Conditional — phase 3 writer when the root is an **initiative** (or absent and the level is broad): epics under it. If not installed, present the confirmed tree for manual entry. |
| `/pair-process-plan-stories`   | Process    | Conditional — phase 3 writer when the root is an **epic** (stories under it), a **story** or an **untyped** root (sibling stories under the root's parent epic), or absent and the level is punctual. If not installed, present the confirmed tree for manual entry. |
| `/pair-capability-record-decision`| Capability | Optional — phase 2, when a flagged domain conflict needs a DDR (`$type: domain`). If not installed, warn and record the conflict in the tree's rationale instead.   |

† **Required _when installed_.** `/pair-capability-grill` carries Required = Yes because phase 1 composes it **by default** — but it **degrades gracefully**: brainstorm warns and runs the interview inline (Phase 1 item 5, and under Graceful Degradation) when grill is absent, never HALTing on it. "Required" here means _composed by default_, not _a hard prerequisite_, so the flag never contradicts the degrade-inline step.

## Arguments

| Argument        | Required | Description                                                                                                                                       |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$root`         | No       | Existing issue the discovery hangs from (e.g. `#205`). Its type and tags deduce level + orientation, and phase 3 integrates the tree under it (a story root: under its parent epic). A root whose type label is absent or unrecognized resolves on the matrix's **fallback row**. Omitted → free-theme discovery, level asked first. |
| `$theme`        | No       | Free theme text to explore. **Precedence with `$root`**: given together, `$theme` **narrows the topic inside `$root`** — it becomes the interview's `$topic` (winning over the root's subject), while the root still deduces level, orientation, and the phase-3 writer; it never re-parents the tree. Given alone, it is the whole topic. If both are omitted, phase 1's opening questions ask for the level and then the theme (items 3 and 4). |
| `$level`        | No       | `broad` (feature/initiative) or `punctual` (single story) — overrides the deduced level.                                                           |
| `$orientation`  | No       | `functional` or `technical` — overrides the deduced orientation.                                                                                   |

## Parametrization (level · orientation · writer)

Deduction inputs, in precedence order: **argument > tags > issue type**. The type decides the level **and** the phase-3 writer; tags decide the orientation. **Most specific row wins**, and the tag row is a **modifier**, not a competing row: it flips the orientation and adds `/pair-capability-map-contexts`, leaving level and writer to the base row. Every invocation matches **exactly one base row** — a type row, the **fallback row** (a `$root` with no recognized type label), or the no-`$root` row — so the triple is never left unresolved. It is always **stated up-front** as a proposal the developer can override.

> **The matrix is normative and lives in [parametrization.md](./parametrization.md)** — one row per `$root` signal, with the phase-2 capability, the phase-3 writer and the parent it receives, plus the rationale for the fallback row and for keying the writer on type rather than level. **Step 0 item 4 reads it on every run**; never resolve the triple from memory.

## Algorithm

### Step 0: Resolve Root, Level, and Orientation

1. **Check**: Is `$root` provided?
2. **Skip**: If absent, level stays unresolved — phase 1 asks it as its FIRST question — and orientation resolves from that answer (or from `$orientation`). Proceed to Phase 1.
3. **Act**: Load `$root` from the PM tool — resolution: see [way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). Unresolvable id → **HALT** (`$root <id> not found`); never guess a root.
4. **Act**: Apply the [Orientation Matrix](./parametrization.md) to the loaded issue's type and tags — no recognized type label resolves on the matrix's **fallback row** (level asked in phase 1, writer `/pair-process-plan-stories` under the root's parent epic, or `/pair-process-plan-epics` when that parent is an initiative), never on no row at all — then state the deduction up-front as a proposal:

   > Root `#[ID]: [Title]` (type: [type | **none recognized — fallback row**], tags: [tags]) → level: **[broad | punctual | asked as phase 1's first question]** · orientation: **[functional | technical]**.
   > Phase 2 will run [`/pair-capability-map-subdomains` | `/pair-capability-map-contexts` | both | resolved once the level is answered]; phase 3 will write with [`/pair-process-plan-epics` | `/pair-process-plan-stories`] under `#[parent ID]` ([the root | the root's parent epic | the root's parent initiative | the initiative the placement points to]).
   > Proceed, override level/orientation, or label `#[ID]` and re-run?

5. **Verify**: Either `$root` is loaded with level, orientation, **and** the phase-3 writer + parent resolved (deduced or overridden), or the level is queued as phase 1's first question — because no `$root` was given, or because the root matched the fallback row — with the writer + parent resolved from that row all the same. No input leaves the triple unresolved.

### Phase 1: Interview — Raw Requirements Blob

1. **Check**: Does a blob for this theme/root already exist in this session, or a prior interview handoff in `.pair/working/`?
2. **Skip**: If a complete blob exists, carry it into Phase 2. A partial handoff is loaded and the interview resumes from its first open item — answered items are never re-asked.
3. **Act**: When no `$root` was given — **or** the root matched the matrix's fallback row (no recognized type) — the **FIRST question** asks the level, before any content question:

   > Is this a **broad** exploration (a feature/initiative, several capabilities) or a **punctual** one (a single story)?
   > **Recommendation**: [broad | punctual] — [why, from the theme's wording, the root's body when there is one, and the current backlog].

   Record the answer as the level, then resolve orientation from the [Orientation Matrix](./parametrization.md).
4. **Act**: When **neither `$root` nor `$theme`** was given, the **second question** asks the theme, still before any content question — `/pair-capability-grill`'s `$topic` has no value without it, so this question is not optional:

   > What should this discovery explore? Name the area, the problem, or the idea.
   > **Recommendation**: [candidate theme] — [why, from the backlog's thinnest area or the last discovery's open items].

   Record the answer as `$theme`.
5. **Act**: Compose `/pair-capability-grill` with `$mode` omitted (interview), `$topic`: **`$theme` when it was given** (it wins over the root's subject and narrows the discovery inside `$root` — see the Arguments table; asked in item 4 when both were omitted), otherwise the root issue's subject — and `$context`: the loaded `$root` issue plus the resolved level/orientation, so grill explores before asking instead of re-fetching. Grill returns the **raw requirements blob** (R3.7) — findings per sub-question, open items, flagged assumptions.
6. **Act**: If the session stops before the interview reaches explicit shared understanding, persist a handoff: take grill's handoff offer — and, when the interview ran **inline** because `/pair-capability-grill` is not installed, write the same file from here, since there is no grill to offer it — so the blob-so-far lands in `.pair/working/` and a later `/pair-process-brainstorm` run resumes from it (item 2 above) rather than restarting. The handoff records the **resolved parametrization** next to the blob — level, orientation, `$theme`/root subject, and the resolved writer + parent — so a fresh session resumes without re-asking the level on the two paths where it was asked rather than deduced (fallback row, no `$root`).
7. **Verify**: A raw requirements blob is available for Phase 2, with level, orientation, and a non-empty `$topic` (theme or root subject) resolved — or the partial blob is persisted as a `.pair/working/` handoff and the run ends there.

### Phase 2: Domain Integration

Places the blob in the domain and reconciles it with what the project has already registered. Runs the Load / Check / Flag / Update-inline sequence of the [Context Map Maintenance](../../../.pair/knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md) guideline.

1. **Check**: Has this blob's placement already run — do the subdomain/context rows and the glossary/entity/rule entries the blob implies already sit in `context-map.md` (or the owning `subdomain/<slug>.context.md`), attributed to this discovery?
2. **Skip**: If the placement is already recorded, confirm it and carry it into Phase 3 — do not re-compose the `/map-*` capability and do not re-walk the map. Partial placement resumes at the first unrecorded area only.
3. **Act — Load**: Read `context-map.md` (in `.pair/adoption/product/`) if it exists, plus the `subdomain/<slug>.context.md` sibling of every subdomain the blob touches whose index row shows an own context file.
4. **Act**: Compose the placement capability the [Orientation Matrix](./parametrization.md) selects, always **scoped to the areas the blob touches, never `$scope: all`** (that is `/pair-process-bootstrap`-only):
   - Broad/functional → Compose `/pair-capability-map-subdomains` with `$scope: [the capability areas the blob touches]` — core/supporting/generic + Volatility for each.
   - Punctual/technical → Compose `/pair-capability-map-contexts` with `$scope: [the contexts/services the blob touches]` — boundaries plus the per-relationship strength/distance/volatility verdict.
   - Broad + technical → both, in that order, on the same scope: placement first, then the integrations it implies.
5. **Act — Check + Flag**: Compare every feature, term, and rule in the blob against the loaded Glossary, Entities, and Common Rules and Invariants. On **conflict** with a registered rule (or a redefined term), stop and surface it explicitly — citing the conflicting rule and the DDR that formalizes it, when one exists — and resolve it with the developer before proceeding. A conflict resolved by changing the registered rule is recorded by composing `/pair-capability-record-decision` with `$type: domain`; never override a registered rule silently.
6. **Act — Update inline**: Write approved new or sharpened terms, entities, and rules back into `context-map.md` (or the owning subdomain's context file) using the guideline's Inline-Maintenance Method — a normal step of this phase, not a separate invocation. Cite the deciding source for each entry.
7. **Act**: If `context-map.md` does not exist, skip items 1, 3, 5 and 6 with a note and keep the placement from item 4 — its absence is the expected steady state, not an error.
8. **Verify**: The blob's areas are placed (or the placement is confirmed as already recorded, or the skip is noted), every conflict is either resolved or recorded, and the map reflects the approved terms. Phase 3 receives the placed blob plus the flagged/unresolved items.

### Phase 3: Tree Triage — Draft Items

1. **Check**: Was a tree already proposed for this discovery — a confirmed proposal list in this session (evaluated **here**, it needs no backlog read), or items under the resolved parent whose idempotency keys already match the tree's candidates (that half needs the tree of item 5 and the parent of item 6, so it is evaluated **once item 6 has resolved the parent**, before the writer is composed in item 7)?
2. **Skip**: If so, re-present that outcome instead of re-triaging; a re-run is a no-op because the composed writer re-checks each key and proposes `ALREADY EXISTS #ID` (skip) for it.
3. **Check**: Is a PM tool configured and reachable ([way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md))?
4. **Act**: No PM tool → **HALT** here with the setup pointer (`/pair-capability-setup-pm`); phases 1–2 keep their output (blob handoff + updated domain files), so re-running after setup starts at this phase.
5. **Act**: Assemble the **candidate tree** from the placed blob — each candidate a **vertical slice** carrying user value, **one level deep**, sized to sit one level under the parent Step 0 already announced: an epic (initiative root, an **untyped root whose parent is an initiative**, or free-theme broad) or a story (epic / story / untyped root with an epic parent, or free-theme punctual), each with its one-line rationale and the domain placement it came from. The tree never carries two levels: an initiative-root discovery produces epics **only**, with no story slices beneath them (see item 7).
6. **Act**: Resolve the parent — **compound insertion** (R3.1) — from the [Orientation Matrix](./parametrization.md)'s writer column, which keys on the **root's type**, not on the level:
   - `$root` is an **initiative** → parent = the root; the tree is epics.
   - `$root` is an **epic** → parent = the root; the tree is stories beneath it (a broad discovery here means _more_ stories, not sub-epics).
   - `$root` is a **story** → parent = the root's **parent epic**; the tree is sibling stories, and the root joins the writer's existing-item registry as an **EXTEND target** (it already exists, so it is never a candidate). If the root has no parent epic (**orphan story** — sub-issue links are optional, so this is a normal PM-tool state) → **HALT** with the `/pair-process-plan-epics` pointer; never write siblings under an unrelated parent.
   - `$root` carries **no recognized type** (fallback row) → treated exactly as a story root above: parent = the root's parent epic, the tree is sibling stories, the root is an **EXTEND target**. Two sub-cases the leaf treatment does not cover: when the root's parent is an **initiative** (an unlabelled epic-shaped container — a normal PM state), the root's own position says it is container-shaped, so do **not** HALT — parent = that initiative, the writer is `/pair-process-plan-epics`, the tree is sibling **epics**, the root still an EXTEND target. When the root has **no parent at all** → **HALT** naming **both** remedies: label `#[ID]` with its real type and re-run (Step 0 offers exactly this), or create the missing epic with `/pair-process-plan-epics` — never invent a parent, and never tell the developer to create an epic when a label is what is missing.
   - No `$root` → parent = the initiative (broad) or epic (punctual) the placement points to, confirmed with the developer. If no such parent exists → **HALT** with a `/pair-process-plan-initiatives` (broad) or `/pair-process-plan-epics` (punctual) pointer; discovery never invents a parent.
7. **Act**: Triage the candidate tree against the **existing** backlog under that parent scope, per the shared [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) convention — extend-vs-create is decided against the existing tree, so discovery merges into the backlog instead of duplicating it. Compose **exactly one** writer — the one resolved in item 6 — passing **both** the parent and the tree:
   - `/pair-process-plan-epics` with `$initiative: [the resolved initiative]` and `$candidates: [the candidate tree]`.
   - `/pair-process-plan-stories` with `$epic: [the resolved epic]` and `$candidates: [the candidate tree]`.

   **One writer per run, one level written**: an initiative-root (or free-theme broad) discovery stops at the confirmed epics — it does **not** cascade into `/pair-process-plan-stories`, because the tree of item 5 carries no story slices to hand over and inventing them here is exactly how phase 3 would flood the backlog. Slicing a new epic is the next, separately confirmed step: `/pair-process-plan-stories` with `$epic: [the new epic]`, or `/pair-process-brainstorm` with `$root: [the new epic]` for another interview-driven pass.

   `$candidates` is what stops the discovery's tree from being discarded: given it, both writers triage the **supplied** candidates instead of re-deriving their own from the parent (their Step 3 Check). Phase 2 has already placed this scope in the domain, so the writer's own domain step is a **confirm-only pass**, never a second mapping: `/pair-process-plan-epics` Step 3.5 confirms a placement its caller made on the same capability areas in this run instead of re-composing `/pair-capability-map-subdomains` (its Skip beat), so the developer approves **one** subdomain-catalog delta per run, not two. Each writer still runs its own registry query and presents the **dry-run** proposal list — `ALREADY EXISTS #ID` (skip) | `EXTEND #ID` | `CREATE`, one per candidate with its rationale — for developer confirmation **before any write**. Brainstorm writes no issue itself.
8. **Act**: Items land as **Draft**: discovery produces planning units, and `/pair-process-refine-story` is what takes a story from Draft to Ready. Report a discovery that changes the product vision as a recommendation to run `/pair-process-specify-prd` — the PRD is never modified here.
9. **Verify**: Every candidate carries exactly one confirmed proposal; created/extended items are Draft, linked under the resolved parent (and to `$root` when given); `.pair/adoption/product/PRD.md` is unchanged.

## Output Format

```text
BRAINSTORM COMPLETE:
├── Scope:       [free theme: "<theme>" | root #ID: Title]
├── Level:       [broad | punctual] ([deduced from type/tags | asked — no root | asked — root has no recognized type | argument override])
├── Orientation: [functional | technical] ([deduced | override])
├── Phase 1:     [blob: N findings, M open items, K assumptions]
├── Phase 2:     [placement: subdomains/contexts touched | skipped — no map, no artifacts] · [conflicts: N flagged, N resolved]
├── Writer:      [/plan-epics | /plan-stories] — one writer, one level — under [#parent ID: Title] ([root | root's parent epic | placement])
├── Phase 3:     [Created: X · Extended: Y · Skipped: Z — all Draft]
├── PRD:         untouched
└── Next:        [/refine-story on the first Draft story | /plan-stories on the first Draft epic (initiative-root discovery stops at epics)]
```

## HALT Conditions

- **`$root` not found** (Step 0) — the id does not resolve to an issue; report it and stop, never guess a root.
- **No PM tool configured** (Phase 3) — phases 1–2 complete and keep their output; HALT with the `/pair-capability-setup-pm` pointer.
- **No parent to hang the tree from** (Phase 3, **any** root or none) — no initiative exists for a broad free-theme tree, no epic for a punctual one, **or** the `$root` story / untyped root has no parent at all to hang siblings from (an orphan is a normal PM-tool state — sub-issue links are optional); HALT with the `/pair-process-plan-initiatives` / `/pair-process-plan-epics` pointer — and, for an **untyped** root, with the labelling remedy alongside it (label `#[ID]` with its real type and re-run) — rather than writing beneath an unrelated parent. An untyped root whose parent is an **initiative** never reaches this HALT: it resolves to `/pair-process-plan-epics` under that initiative (Phase 3 item 6).
- **Unresolved domain conflict** (Phase 2) — a flagged conflict with a registered rule or DDR that the developer has not resolved; discovery never overrides a registered rule.
- **Developer rejects the tree** (Phase 3) — resolve the triage proposal before any write.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) — brainstorm is one of the four orchestrators that resume **per-phase**. Re-invoking it on a partially completed discovery is safe and expected: each phase checks its own output before acting, so the run resumes at the first unfinished phase and never re-does a completed one.

> **The itemized per-phase resume list is in [resume.md](./resume.md)** — what each phase detects, what it confirms, and the one path that re-asks (the level, when it was asked rather than deduced and no `.pair/working/` handoff survives). Read it whenever a re-invocation lands mid-discovery.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) for the standard scenarios (optional skill not installed → skip that step and note it; PM tool unreachable → ask the developer directly). **No missing composition fails a discovery** — grill, `/map-*`, `/pair-capability-record-decision`, the plan-\* writers and even a missing `context-map.md` each degrade to a noted skip or an inline substitute; the only hard stops are the HALT Conditions above.

> **The per-composition fallback for each one is in [degradation.md](./degradation.md)** — read it when a composition brainstorm expects is missing, not on a normal run.

## Notes

- **Phase order is fixed** (interview → domain → triage) and each phase's output feeds the next — a phase never runs on a blob the previous phase has not produced.
- **Composes, never re-derives**: the interview is `/pair-capability-grill`'s, the domain placement `/map-*`'s, the writes `/pair-process-plan-epics`/`/pair-process-plan-stories`' (which own the to-issues triage). Brainstorm owns the phase order and the level/orientation parametrization only (D24).
- **The writer is keyed on the root's type, not on the level** — `/pair-process-plan-epics` writes only under an initiative, `/pair-process-plan-stories` only under an epic — and it receives the discovery's tree explicitly as `$candidates`, so phase 2's output is what phase 3 triages rather than a tree the writer re-derives from its parent.
- **One writer per run, one level written**: an initiative-root discovery lands epics and stops; it never cascades into `/pair-process-plan-stories`. A root with no recognized type label resolves on the matrix's **fallback row** (leaf treatment: siblings under its parent epic — or sibling epics under its parent initiative, when that is where it sits), so an unlabelled issue is a normal input, not an unhandled one.
- **Branch-specific reference lives beside the skill**, per progressive disclosure: the normative deduction matrix and its rationale in [parametrization.md](./parametrization.md), the per-phase resume list in [resume.md](./resume.md). The algorithm here stays the path every run walks.
- **The PRD is never modified** — R3.4: discovery writes to the backlog and to domain context files; product-vision changes are surfaced as a `/pair-process-specify-prd` recommendation.
- **Modifies PM tool state** (phase 3, via the composed plan-* skills) **and adoption files** (phase 2, context map + domain catalogs).
- **Draft is the exit state**: the tree is a planning artifact — `/pair-process-refine-story` is the single Draft→Ready path (D24), and `/pair-next` picks the tree up from there.
