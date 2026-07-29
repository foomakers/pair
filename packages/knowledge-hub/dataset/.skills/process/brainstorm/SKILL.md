---
name: brainstorm
description: "Runs discovery in three fixed phases — grill interview, domain integration, backlog tree triage — on a free theme or an existing `$root` issue, landing an integrated Draft epic/story tree while leaving the PRD untouched. Invoke to open a new feature area or to deepen an existing epic/story ('brainstorm the notifications area', 'explore what is missing under #205'); level (broad/punctual) and orientation (functional/technical) are deduced from the root's type and tags, or asked as the first interview question when no root is given. Composes /grill, /map-subdomains, /map-contexts, /plan-epics, /plan-stories."
version: 0.1.0
author: Foomakers
---

# /brainstorm — Structured Discovery (3 phases)

Turn a rough theme — or an existing epic/story — into an **integrated Draft tree** in the backlog, through three phases: **interview → domain → triage**. **Phase order is fixed**, and each phase's output feeds the next: the interview's raw requirements blob is what the domain phase places, and the placed result is what the triage phase slices into issues. The **PRD is never modified** — discovery lands in the backlog and in domain context files, not in the product vision.

Discovery is **parametrized**, not a fixed script: with `$root` the level, the orientation, and the phase-3 writer are deduced from the root issue's type and tags; without it, the level is the first question asked. **Per-phase idempotency** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) and the itemized resume list under [Idempotent Re-invocation](#idempotent-re-invocation): each phase checks its own output before acting, so a re-run resumes at the first unfinished phase (an interrupted interview resumes from its `.pair/working/` handoff) instead of re-interviewing, re-placing, or re-triaging.

Discovery is also the **only** new process skill (D24): every phase delegates to existing capabilities — brainstorm owns the phase order, the parametrization, and nothing else.

## Composed Skills

| Skill             | Type       | Required                                                                                                                                                          |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/grill`          | Capability | Yes † — phase 1 interview (raw requirements blob). If not installed, warn and run the interview inline: one question per turn, each with a recommendation.           |
| `/map-subdomains` | Capability | Optional — phase 2 placement for a **broad** discovery: functional, and alongside `/map-contexts` when technical. Scoped. If not installed, warn and skip domain placement. |
| `/map-contexts`   | Capability | Optional — phase 2 placement for a **punctual or technical** discovery, scoped. If not installed, warn and skip context mapping.                                    |
| `/plan-epics`     | Process    | Conditional — phase 3 writer when the root is an **initiative** (or absent and the level is broad): epics under it. If not installed, present the confirmed tree for manual entry. |
| `/plan-stories`   | Process    | Conditional — phase 3 writer when the root is an **epic** (stories under it), a **story** or an **untyped** root (sibling stories under the root's parent epic), or absent and the level is punctual. If not installed, present the confirmed tree for manual entry. |
| `/record-decision`| Capability | Optional — phase 2, when a flagged domain conflict needs a DDR (`$type: domain`). If not installed, warn and record the conflict in the tree's rationale instead.   |

† **Required _when installed_.** `/grill` carries Required = Yes because phase 1 composes it **by default** — but it **degrades gracefully**: brainstorm warns and runs the interview inline (Phase 1 item 5, and under Graceful Degradation) when grill is absent, never HALTing on it. "Required" here means _composed by default_, not _a hard prerequisite_, so the flag never contradicts the degrade-inline step.

## Arguments

| Argument        | Required | Description                                                                                                                                       |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$root`         | No       | Existing issue the discovery hangs from (e.g. `#205`). Its type and tags deduce level + orientation, and phase 3 integrates the tree under it (a story root: under its parent epic). A root whose type label is absent or unrecognized resolves on the matrix's **fallback row**. Omitted → free-theme discovery, level asked first. |
| `$theme`        | No       | Free theme text to explore (`$root` absent). If both are omitted, phase 1's opening questions ask for the level and then the theme (items 3 and 4). |
| `$level`        | No       | `broad` (feature/initiative) or `punctual` (single story) — overrides the deduced level.                                                           |
| `$orientation`  | No       | `functional` or `technical` — overrides the deduced orientation.                                                                                   |

## Orientation Matrix

Deduction inputs, in precedence order: **argument > tags > issue type**. The type decides the level **and** the phase-3 writer; tags decide the orientation and win over the type-derived default. **Most specific row wins**, and the tag row is a **modifier**, not a competing row: it flips the orientation and adds `/map-contexts`, leaving the level and the writer as the base row resolved them.

Every invocation matches **exactly one base row** — one of the three type rows, the **fallback row** (a `$root` whose type label is absent or unrecognized), or the no-`$root` row — so the modifier always has a base to modify, and there is no input for which level, orientation, and writer stay unresolved.

| `$root` signal                                        | Level      | Orientation | Phase 2 capability                                                              | Phase 3 writer (and the parent it receives)                                                                                                     |
| ----------------------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| type `initiative`                                      | broad      | functional  | `/map-subdomains`                                                               | `/plan-epics` with `$initiative: <the root>`                                                                                                     |
| type `epic`                                            | broad      | functional  | `/map-subdomains`                                                               | `/plan-stories` with `$epic: <the root>`                                                                                                         |
| type `story`                                           | punctual   | functional  | `/map-contexts`                                                                 | `/plan-stories` with `$epic: <the root's parent epic>` — sibling stories; the root itself enters the writer's registry as an **EXTEND target**    |
| **no recognized type** on `$root` (fallback)            | asked first (phase 1), exactly as on the no-`$root` path | functional, unless the tag modifier flips it | resolved once the level is answered: broad → `/map-subdomains`, punctual → `/map-contexts` | `/plan-stories` with `$epic: <the root's parent epic>` — an untyped root is treated as a **leaf, never a container**, so it enters the writer's registry as an **EXTEND target** exactly as a story root does; no parent epic resolves → **HALT** (no parent to hang the tree from) |
| any type or none + a `tech` / `tech-debt` / `infra` tag (modifier) | unchanged  | technical   | `/map-contexts` — **in addition to, and after**, the base row's capability when that row is broad | unchanged (the base row's)                                                                                                     |
| no `$root` (free theme)                                | asked first (phase 1) | follows the answered level, `functional` default | resolved once the level is answered: broad → `/map-subdomains`, punctual → `/map-contexts` | broad → `/plan-epics` with `$initiative: <the initiative the placement points to, confirmed>`; punctual → `/plan-stories` with `$epic: <the epic the placement points to, confirmed>` |

**Why a fallback row rather than a HALT**: type is a PM-tool **label**, so its absence is a normal state, not an error — refusing to run would make discovery unusable on any unlabelled issue. The fallback resolves conservatively (leaf, never a container) and stays overridable: the developer can label the issue or pass `$level` to short-circuit the question. A tag-only root (e.g. labelled `tech-debt` with no type) therefore still honours the `tech`/`tech-debt`/`infra` → **technical** deduction through the modifier row.

The **level sizes the discovery** — how wide the interview goes, how many slices the tree carries — while the **root's type selects the writer**, because a writer's parent must sit exactly one level above what it writes: `/plan-epics` can only hang epics off an **initiative**, `/plan-stories` only stories off an **epic**. So a broad discovery rooted on an epic still lands as stories (many of them), never as sub-epics.

The deduced triple (level, orientation, writer) is always **stated up-front** and is a proposal: the developer can override level or orientation in the same turn (equivalently, by passing `$level` / `$orientation`) — the writer follows from the root's type and the resolved level, never from an override of its own.

## Algorithm

### Step 0: Resolve Root, Level, and Orientation

1. **Check**: Is `$root` provided?
2. **Skip**: If absent, level stays unresolved — phase 1 asks it as its FIRST question — and orientation resolves from that answer (or from `$orientation`). Proceed to Phase 1.
3. **Act**: Load `$root` from the PM tool — resolution: see [way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). Unresolvable id → **HALT** (`$root <id> not found`); never guess a root.
4. **Act**: Apply the [Orientation Matrix](#orientation-matrix) to the loaded issue's type and tags — no recognized type label resolves on the matrix's **fallback row** (level asked in phase 1, writer `/plan-stories` under the root's parent epic), never on no row at all — then state the deduction up-front as a proposal:

   > Root `#[ID]: [Title]` (type: [type | **none recognized — fallback row**], tags: [tags]) → level: **[broad | punctual | asked as phase 1's first question]** · orientation: **[functional | technical]**.
   > Phase 2 will run [`/map-subdomains` | `/map-contexts` | both | resolved once the level is answered]; phase 3 will write with [`/plan-epics` | `/plan-stories`] under `#[parent ID]` ([the root | the root's parent epic | the initiative the placement points to]).
   > Proceed, override level/orientation, or label `#[ID]` and re-run?

5. **Verify**: Either `$root` is loaded with level, orientation, **and** the phase-3 writer + parent resolved (deduced or overridden), or the level is queued as phase 1's first question — because no `$root` was given, or because the root matched the fallback row — with the writer + parent resolved from that row all the same. No input leaves the triple unresolved.

### Phase 1: Interview — Raw Requirements Blob

1. **Check**: Does a blob for this theme/root already exist in this session, or a prior interview handoff in `.pair/working/`?
2. **Skip**: If a complete blob exists, carry it into Phase 2. A partial handoff is loaded and the interview resumes from its first open item — answered items are never re-asked.
3. **Act**: When no `$root` was given — **or** the root matched the matrix's fallback row (no recognized type) — the **FIRST question** asks the level, before any content question:

   > Is this a **broad** exploration (a feature/initiative, several capabilities) or a **punctual** one (a single story)?
   > **Recommendation**: [broad | punctual] — [why, from the theme's wording, the root's body when there is one, and the current backlog].

   Record the answer as the level, then resolve orientation from the [Orientation Matrix](#orientation-matrix).
4. **Act**: When **neither `$root` nor `$theme`** was given, the **second question** asks the theme, still before any content question — `/grill`'s `$topic` has no value without it, so this question is not optional:

   > What should this discovery explore? Name the area, the problem, or the idea.
   > **Recommendation**: [candidate theme] — [why, from the backlog's thinnest area or the last discovery's open items].

   Record the answer as `$theme`.
5. **Act**: Compose `/grill` with `$mode` omitted (interview), `$topic`: the free theme (`$theme`, asked in item 4 when it was omitted) or the root issue's subject, and `$context`: the loaded `$root` issue plus the resolved level/orientation, so grill explores before asking instead of re-fetching. Grill returns the **raw requirements blob** (R3.7) — findings per sub-question, open items, flagged assumptions.
6. **Act**: If the session stops before the interview reaches explicit shared understanding, take grill's handoff offer: the blob-so-far is written to `.pair/working/` so a later `/brainstorm` run resumes from it (Step 2 above) rather than restarting.
7. **Verify**: A raw requirements blob is available for Phase 2, with level, orientation, and a non-empty `$topic` (theme or root subject) resolved — or the partial blob is persisted as a `.pair/working/` handoff and the run ends there.

### Phase 2: Domain Integration

Places the blob in the domain and reconciles it with what the project has already registered. Runs the Load / Check / Flag / Update-inline sequence of the [Context Map Maintenance](../../../.pair/knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md) guideline.

1. **Check**: Has this blob's placement already run — do the subdomain/context rows and the glossary/entity/rule entries the blob implies already sit in `context-map.md` (or the owning `subdomain/<slug>.context.md`), attributed to this discovery?
2. **Skip**: If the placement is already recorded, confirm it and carry it into Phase 3 — do not re-compose the `/map-*` capability and do not re-walk the map. Partial placement resumes at the first unrecorded area only.
3. **Act — Load**: Read `context-map.md` (in `.pair/adoption/product/`) if it exists, plus the `subdomain/<slug>.context.md` sibling of every subdomain the blob touches whose index row shows an own context file.
4. **Act**: Compose the placement capability the [Orientation Matrix](#orientation-matrix) selects, always **scoped to the areas the blob touches, never `$scope: all`** (that is `/bootstrap`-only):
   - Broad/functional → Compose `/map-subdomains` with `$scope: [the capability areas the blob touches]` — core/supporting/generic + Volatility for each.
   - Punctual/technical → Compose `/map-contexts` with `$scope: [the contexts/services the blob touches]` — boundaries plus the per-relationship strength/distance/volatility verdict.
   - Broad + technical → both, in that order, on the same scope: placement first, then the integrations it implies.
5. **Act — Check + Flag**: Compare every feature, term, and rule in the blob against the loaded Glossary, Entities, and Common Rules and Invariants. On **conflict** with a registered rule (or a redefined term), stop and surface it explicitly — citing the conflicting rule and the DDR that formalizes it, when one exists — and resolve it with the developer before proceeding. A conflict resolved by changing the registered rule is recorded by composing `/record-decision` with `$type: domain`; never override a registered rule silently.
6. **Act — Update inline**: Write approved new or sharpened terms, entities, and rules back into `context-map.md` (or the owning subdomain's context file) using the guideline's Inline-Maintenance Method — a normal step of this phase, not a separate invocation. Cite the deciding source for each entry.
7. **Act**: If `context-map.md` does not exist, skip items 1, 3, 5 and 6 with a note and keep the placement from item 4 — its absence is the expected steady state, not an error.
8. **Verify**: The blob's areas are placed (or the placement is confirmed as already recorded, or the skip is noted), every conflict is either resolved or recorded, and the map reflects the approved terms. Phase 3 receives the placed blob plus the flagged/unresolved items.

### Phase 3: Tree Triage — Draft Items

1. **Check**: Was a tree already proposed for this discovery — a confirmed proposal list in this session (evaluated **here**, it needs no backlog read), or items under the resolved parent whose idempotency keys already match the tree's candidates (that half needs the tree of item 5 and the parent of item 6, so it is evaluated **once item 6 has resolved the parent**, before the writer is composed in item 7)?
2. **Skip**: If so, re-present that outcome instead of re-triaging; a re-run is a no-op because the composed writer re-checks each key and proposes `ALREADY EXISTS #ID` (skip) for it.
3. **Check**: Is a PM tool configured and reachable ([way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md))?
4. **Act**: No PM tool → **HALT** here with the setup pointer (`/setup-pm`); phases 1–2 keep their output (blob handoff + updated domain files), so re-running after setup starts at this phase.
5. **Act**: Assemble the **candidate tree** from the placed blob — each candidate a **vertical slice** carrying user value, **one level deep**, sized as an epic (initiative root, or free-theme broad) or a story (epic / story / untyped root, or free-theme punctual), each with its one-line rationale and the domain placement it came from. The tree never carries two levels: an initiative-root discovery produces epics **only**, with no story slices beneath them (see item 7).
6. **Act**: Resolve the parent — **compound insertion** (R3.1) — from the [Orientation Matrix](#orientation-matrix)'s writer column, which keys on the **root's type**, not on the level:
   - `$root` is an **initiative** → parent = the root; the tree is epics.
   - `$root` is an **epic** → parent = the root; the tree is stories beneath it (a broad discovery here means _more_ stories, not sub-epics).
   - `$root` is a **story** → parent = the root's **parent epic**; the tree is sibling stories, and the root joins the writer's existing-item registry as an **EXTEND target** (it already exists, so it is never a candidate). If the root has no parent epic (**orphan story** — sub-issue links are optional, so this is a normal PM-tool state) → **HALT** with the `/plan-epics` pointer; never write siblings under an unrelated parent.
   - `$root` carries **no recognized type** (fallback row) → treated exactly as a story root above: parent = the root's parent epic, the tree is sibling stories, the root is an **EXTEND target**, and an unresolvable parent epic → **HALT** with the same pointer.
   - No `$root` → parent = the initiative (broad) or epic (punctual) the placement points to, confirmed with the developer. If no such parent exists → **HALT** with a `/plan-initiatives` (broad) or `/plan-epics` (punctual) pointer; discovery never invents a parent.
7. **Act**: Triage the candidate tree against the **existing** backlog under that parent scope, per the shared [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) convention — extend-vs-create is decided against the existing tree, so discovery merges into the backlog instead of duplicating it. Compose **exactly one** writer — the one resolved in item 6 — passing **both** the parent and the tree:
   - `/plan-epics` with `$initiative: [the resolved initiative]` and `$candidates: [the candidate tree]`.
   - `/plan-stories` with `$epic: [the resolved epic]` and `$candidates: [the candidate tree]`.

   **One writer per run, one level written**: an initiative-root (or free-theme broad) discovery stops at the confirmed epics — it does **not** cascade into `/plan-stories`, because the tree of item 5 carries no story slices to hand over and inventing them here is exactly how phase 3 would flood the backlog. Slicing a new epic is the next, separately confirmed step: `/plan-stories` with `$epic: [the new epic]`, or `/brainstorm` with `$root: [the new epic]` for another interview-driven pass.

   `$candidates` is what stops the discovery's tree from being discarded: given it, both writers triage the **supplied** candidates instead of re-deriving their own from the parent (their Step 3 Check). Each still runs its own registry query and presents the **dry-run** proposal list — `ALREADY EXISTS #ID` (skip) | `EXTEND #ID` | `CREATE`, one per candidate with its rationale — for developer confirmation **before any write**. Brainstorm writes no issue itself.
8. **Act**: Items land as **Draft**: discovery produces planning units, and `/refine-story` is what takes a story from Draft to Ready. Report a discovery that changes the product vision as a recommendation to run `/specify-prd` — the PRD is never modified here.
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
- **No PM tool configured** (Phase 3) — phases 1–2 complete and keep their output; HALT with the `/setup-pm` pointer.
- **No parent to hang the tree from** (Phase 3, **any** root or none) — no initiative exists for a broad free-theme tree, no epic for a punctual one, **or** the `$root` story / untyped root has no parent epic to hang siblings from (an orphan is a normal PM-tool state — sub-issue links are optional); HALT with the `/plan-initiatives` / `/plan-epics` pointer rather than writing beneath an unrelated parent.
- **Unresolved domain conflict** (Phase 2) — a flagged conflict with a registered rule or DDR that the developer has not resolved; discovery never overrides a registered rule.
- **Developer rejects the tree** (Phase 3) — resolve the triage proposal before any write.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invoking `/brainstorm` on a partially completed discovery is safe and expected — per-phase:

1. **Root, level, orientation, writer** (Step 0): re-deduced from the same root and tags — a deterministic read, never a re-ask; a prior override stated in the session (or passed as `$level`/`$orientation`) still wins.
2. **Phase 1 — interview**: detects a complete blob (session or `.pair/working/` handoff) and carries it forward; a partial handoff resumes from its first open item — answered items are never re-asked.
3. **Phase 2 — placement**: detects the blob's areas already present in `context-map.md` / the owning `subdomain/<slug>.context.md` and confirms them instead of re-composing `/map-*`; partial placement resumes at the first unrecorded area. Glossary/rule maintenance re-checks each term before adding it (Context Map Maintenance), so a re-run never duplicates an entry.
4. **Phase 3 — triage**: detects a tree already proposed for this discovery (a session-confirmed list — evaluable immediately; or items under the resolved parent matching the candidates' idempotency keys — evaluated only **after** item 6 has resolved that parent, which is why the phase's Check is split across it) and re-presents that outcome; otherwise the composed writer's own `ALREADY EXISTS #ID` check makes the write a no-op per already-created candidate.
5. **PRD**: never written, so nothing to detect — the invariant holds on every run.

The skill resumes from the first incomplete phase — never re-does a completed one; idempotency ensures correct state.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill not installed → skip that step and note it; PM tool unreachable → ask the developer directly) for the standard scenarios. Additional cases:

- **`/grill` not installed** (Phase 1): warn and run the interview inline — one question per turn, each with a recommendation, ending only on explicit shared understanding — and assemble the blob from the answers. Discovery still completes.
- **`context-map.md` absent** (Phase 2): skip the Load/Check/Flag/Update-inline sequence and keep the scoped placement — its absence is the expected steady state, not an error, so phase 2 degrades without failing.
- **`/map-subdomains` / `/map-contexts` not installed, or no domain artifacts** (Phase 2): the blob still reaches phase 3; placement is skipped with a note, and the tree carries no subdomain/context annotation.
- **`/record-decision` not installed** (Phase 2): a flagged conflict the developer resolves by changing a registered rule cannot be formalized as a DDR — warn and record the conflict, its resolution, and the rule it changes in the **candidate tree's rationale** instead, so the decision is not lost; discovery still completes.
- **`/plan-epics` / `/plan-stories` not installed** (Phase 3): present the confirmed tree with its EXTEND/CREATE proposals for manual entry rather than writing issues from here.

## Notes

- **Phase order is fixed** (interview → domain → triage) and each phase's output feeds the next — a phase never runs on a blob the previous phase has not produced.
- **Composes, never re-derives**: the interview is `/grill`'s, the domain placement `/map-*`'s, the writes `/plan-epics`/`/plan-stories`' (which own the to-issues triage). Brainstorm owns the phase order and the level/orientation parametrization only (D24).
- **The writer is keyed on the root's type, not on the level** — `/plan-epics` writes only under an initiative, `/plan-stories` only under an epic — and it receives the discovery's tree explicitly as `$candidates`, so phase 2's output is what phase 3 triages rather than a tree the writer re-derives from its parent.
- **One writer per run, one level written**: an initiative-root discovery lands epics and stops; it never cascades into `/plan-stories`. A root with no recognized type label resolves on the matrix's **fallback row** (leaf treatment: siblings under its parent epic), so an unlabelled issue is a normal input, not an unhandled one.
- **The PRD is never modified** — R3.4: discovery writes to the backlog and to domain context files; product-vision changes are surfaced as a `/specify-prd` recommendation.
- **Modifies PM tool state** (phase 3, via the composed plan-* skills) **and adoption files** (phase 2, context map + domain catalogs).
- **Draft is the exit state**: the tree is a planning artifact — `/refine-story` is the single Draft→Ready path (D24), and `/next` picks the tree up from there.
