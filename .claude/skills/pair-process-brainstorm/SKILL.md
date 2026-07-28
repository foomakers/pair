---
name: pair-process-brainstorm
description: "Runs discovery in three fixed phases — grill interview, domain integration, backlog tree triage — on a free theme or an existing `$root` issue, landing an integrated Draft epic/story tree while leaving the PRD untouched. Invoke to open a new feature area or to deepen an existing epic/story ('brainstorm the notifications area', 'explore what is missing under #205'); level (broad/punctual) and orientation (functional/technical) are deduced from the root's type and tags, or asked as the first interview question when no root is given. Composes /pair-capability-grill, /pair-capability-map-subdomains, /pair-capability-map-contexts, /pair-process-plan-epics, /pair-process-plan-stories."
version: 0.1.0
author: Foomakers
---

# /pair-process-brainstorm — Structured Discovery (3 phases)

Turn a rough theme — or an existing epic/story — into an **integrated Draft tree** in the backlog, through three phases: **interview → domain → triage**. **Phase order is fixed**, and each phase's output feeds the next: the interview's raw requirements blob is what the domain phase places, and the placed result is what the triage phase slices into issues. The **PRD is never modified** — discovery lands in the backlog and in domain context files, not in the product vision.

Discovery is **parametrized**, not a fixed script: with `$root` the level, the orientation, and the phase-3 writer are deduced from the root issue's type and tags; without it, the level is the first question asked. **Per-phase idempotency** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) and the itemized resume list under [Idempotent Re-invocation](#idempotent-re-invocation): each phase checks its own output before acting, so a re-run resumes at the first unfinished phase (an interrupted interview resumes from its `.pair/working/` handoff) instead of re-interviewing, re-placing, or re-triaging.

Discovery is also the **only** new process skill (D24): every phase delegates to existing capabilities — brainstorm owns the phase order, the parametrization, and nothing else.

## Composed Skills

| Skill             | Type       | Required                                                                                                                                                          |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/pair-capability-grill`          | Capability | Yes † — phase 1 interview (raw requirements blob). If not installed, warn and run the interview inline: one question per turn, each with a recommendation.           |
| `/pair-capability-map-subdomains` | Capability | Optional — phase 2 placement for a **broad** discovery: functional, and alongside `/pair-capability-map-contexts` when technical. Scoped. If not installed, warn and skip domain placement. |
| `/pair-capability-map-contexts`   | Capability | Optional — phase 2 placement for a **punctual or technical** discovery, scoped. If not installed, warn and skip context mapping.                                    |
| `/pair-process-plan-epics`     | Process    | Conditional — phase 3 writer when the root is an **initiative** (or absent and the level is broad): epics under it. If not installed, present the confirmed tree for manual entry. |
| `/pair-process-plan-stories`   | Process    | Conditional — phase 3 writer when the root is an **epic** (stories under it) or a **story** (sibling stories under the root's parent epic). If not installed, present the confirmed tree for manual entry. |
| `/pair-capability-record-decision`| Capability | Optional — phase 2, when a flagged domain conflict needs a DDR (`$type: domain`). If not installed, warn and record the conflict in the tree's rationale instead.   |

† **Required _when installed_.** `/pair-capability-grill` carries Required = Yes because phase 1 composes it **by default** — but it **degrades gracefully**: brainstorm warns and runs the interview inline (Phase 1 item 4, and under Graceful Degradation) when grill is absent, never HALTing on it. "Required" here means _composed by default_, not _a hard prerequisite_, so the flag never contradicts the degrade-inline step.

## Arguments

| Argument        | Required | Description                                                                                                                                       |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$root`         | No       | Existing issue the discovery hangs from (e.g. `#205`). Its type and tags deduce level + orientation, and phase 3 integrates the tree under it. Omitted → free-theme discovery, level asked first. |
| `$theme`        | No       | Free theme text to explore (`$root` absent). If both are omitted, phase 1's opening questions ask for the level and then the theme.                |
| `$level`        | No       | `broad` (feature/initiative) or `punctual` (single story) — overrides the deduced level.                                                           |
| `$orientation`  | No       | `functional` or `technical` — overrides the deduced orientation.                                                                                   |

## Orientation Matrix

Deduction inputs, in precedence order: **argument > tags > issue type**. The type decides the level **and** the phase-3 writer; tags decide the orientation and win over the type-derived default. **Most specific row wins**, and the tag row is a **modifier**, not a competing row: it flips the orientation and adds `/pair-capability-map-contexts`, leaving the level and the writer as the type row resolved them.

| `$root` signal                                        | Level      | Orientation | Phase 2 capability                                                              | Phase 3 writer (and the parent it receives)                                                                                                     |
| ----------------------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| type `initiative`                                      | broad      | functional  | `/pair-capability-map-subdomains`                                                               | `/pair-process-plan-epics` with `$initiative: <the root>`                                                                                                     |
| type `epic`                                            | broad      | functional  | `/pair-capability-map-subdomains`                                                               | `/pair-process-plan-stories` with `$epic: <the root>`                                                                                                         |
| type `story`                                           | punctual   | functional  | `/pair-capability-map-contexts`                                                                 | `/pair-process-plan-stories` with `$epic: <the root's parent epic>` — sibling stories; the root itself enters the writer's registry as an **EXTEND target**    |
| any type + a `tech` / `tech-debt` / `infra` tag (modifier) | unchanged  | technical   | `/pair-capability-map-contexts` — **in addition to, and after**, the type row's capability when that row is broad | unchanged (the type row's)                                                                                                     |
| no `$root` (free theme)                                | asked first (phase 1) | follows the answered level, `functional` default | resolved once the level is answered                    | broad → `/pair-process-plan-epics` with `$initiative: <the initiative the placement points to, confirmed>`; punctual → `/pair-process-plan-stories` with `$epic: <the epic the placement points to, confirmed>` |

The **level sizes the discovery** — how wide the interview goes, how many slices the tree carries — while the **root's type selects the writer**, because a writer's parent must sit exactly one level above what it writes: `/pair-process-plan-epics` can only hang epics off an **initiative**, `/pair-process-plan-stories` only stories off an **epic**. So a broad discovery rooted on an epic still lands as stories (many of them), never as sub-epics.

The deduced triple (level, orientation, writer) is always **stated up-front** and is a proposal: the developer can override level or orientation in the same turn (equivalently, by passing `$level` / `$orientation`) — the writer follows from the root's type and the resolved level, never from an override of its own.

## Algorithm

### Step 0: Resolve Root, Level, and Orientation

1. **Check**: Is `$root` provided?
2. **Skip**: If absent, level stays unresolved — phase 1 asks it as its FIRST question — and orientation resolves from that answer (or from `$orientation`). Proceed to Phase 1.
3. **Act**: Load `$root` from the PM tool — resolution: see [way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). Unresolvable id → **HALT** (`$root <id> not found`); never guess a root.
4. **Act**: Apply the [Orientation Matrix](#orientation-matrix) to the loaded issue's type and tags, then state the deduction up-front as a proposal:

   > Root `#[ID]: [Title]` (type: [type], tags: [tags]) → level: **[broad | punctual]** · orientation: **[functional | technical]**.
   > Phase 2 will run [`/pair-capability-map-subdomains` | `/pair-capability-map-contexts` | both]; phase 3 will write with [`/pair-process-plan-epics` | `/pair-process-plan-stories`] under `#[parent ID]` ([the root | the root's parent epic | the initiative the placement points to]).
   > Proceed, or override level/orientation?

5. **Verify**: Either `$root` is loaded with level, orientation, **and** the phase-3 writer + parent resolved (deduced or overridden), or no `$root` was given and the level is queued as phase 1's first question.

### Phase 1: Interview — Raw Requirements Blob

1. **Check**: Does a blob for this theme/root already exist in this session, or a prior interview handoff in `.pair/working/`?
2. **Skip**: If a complete blob exists, carry it into Phase 2. A partial handoff is loaded and the interview resumes from its first open item — answered items are never re-asked.
3. **Act**: When no `$root` was given, the **FIRST question** asks the level, before any content question:

   > Is this a **broad** exploration (a feature/initiative, several capabilities) or a **punctual** one (a single story)?
   > **Recommendation**: [broad | punctual] — [why, from the theme's wording and the current backlog].

   Record the answer as the level, then resolve orientation from the [Orientation Matrix](#orientation-matrix).
4. **Act**: Compose `/pair-capability-grill` with `$mode` omitted (interview), `$topic`: the free theme (`$theme`) or the root issue's subject, and `$context`: the loaded `$root` issue plus the resolved level/orientation, so grill explores before asking instead of re-fetching. Grill returns the **raw requirements blob** (R3.7) — findings per sub-question, open items, flagged assumptions.
5. **Act**: If the session stops before the interview reaches explicit shared understanding, take grill's handoff offer: the blob-so-far is written to `.pair/working/` so a later `/pair-process-brainstorm` run resumes from it (Step 2 above) rather than restarting.
6. **Verify**: A raw requirements blob is available for Phase 2, with level and orientation resolved — or the partial blob is persisted as a `.pair/working/` handoff and the run ends there.

### Phase 2: Domain Integration

Places the blob in the domain and reconciles it with what the project has already registered. Runs the Load / Check / Flag / Update-inline sequence of the [Context Map Maintenance](../../../.pair/knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md) guideline.

1. **Check**: Has this blob's placement already run — do the subdomain/context rows and the glossary/entity/rule entries the blob implies already sit in `context-map.md` (or the owning `subdomain/<slug>.context.md`), attributed to this discovery?
2. **Skip**: If the placement is already recorded, confirm it and carry it into Phase 3 — do not re-compose the `/map-*` capability and do not re-walk the map. Partial placement resumes at the first unrecorded area only.
3. **Act — Load**: Read `context-map.md` (in `.pair/adoption/product/`) if it exists, plus the `subdomain/<slug>.context.md` sibling of every subdomain the blob touches whose index row shows an own context file.
4. **Act**: Compose the placement capability the [Orientation Matrix](#orientation-matrix) selects, always **scoped to the areas the blob touches, never `$scope: all`** (that is `/pair-process-bootstrap`-only):
   - Broad/functional → Compose `/pair-capability-map-subdomains` with `$scope: [the capability areas the blob touches]` — core/supporting/generic + Volatility for each.
   - Punctual/technical → Compose `/pair-capability-map-contexts` with `$scope: [the contexts/services the blob touches]` — boundaries plus the per-relationship strength/distance/volatility verdict.
   - Broad + technical → both, in that order, on the same scope: placement first, then the integrations it implies.
5. **Act — Check + Flag**: Compare every feature, term, and rule in the blob against the loaded Glossary, Entities, and Common Rules and Invariants. On **conflict** with a registered rule (or a redefined term), stop and surface it explicitly — citing the conflicting rule and the DDR that formalizes it, when one exists — and resolve it with the developer before proceeding. A conflict resolved by changing the registered rule is recorded by composing `/pair-capability-record-decision` with `$type: domain`; never override a registered rule silently.
6. **Act — Update inline**: Write approved new or sharpened terms, entities, and rules back into `context-map.md` (or the owning subdomain's context file) using the guideline's Inline-Maintenance Method — a normal step of this phase, not a separate invocation. Cite the deciding source for each entry.
7. **Act**: If `context-map.md` does not exist, skip items 1, 3, 5 and 6 with a note and keep the placement from item 4 — its absence is the expected steady state, not an error.
8. **Verify**: The blob's areas are placed (or the placement is confirmed as already recorded, or the skip is noted), every conflict is either resolved or recorded, and the map reflects the approved terms. Phase 3 receives the placed blob plus the flagged/unresolved items.

### Phase 3: Tree Triage — Draft Items

1. **Check**: Was a tree already proposed for this discovery — a confirmed proposal list in this session, or items under the resolved parent whose idempotency keys already match the tree's candidates?
2. **Skip**: If so, re-present that outcome instead of re-triaging; a re-run is a no-op because the composed writer re-checks each key and proposes `ALREADY EXISTS #ID` (skip) for it.
3. **Check**: Is a PM tool configured and reachable ([way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md))?
4. **Act**: No PM tool → **HALT** here with the setup pointer (`/pair-capability-setup-pm`); phases 1–2 keep their output (blob handoff + updated domain files), so re-running after setup starts at this phase.
5. **Act**: Assemble the **candidate tree** from the placed blob — each candidate a **vertical slice** carrying user value, sized as an epic (initiative root) or a story (epic/story root), each with its one-line rationale and the domain placement it came from.
6. **Act**: Resolve the parent — **compound insertion** (R3.1) — from the [Orientation Matrix](#orientation-matrix)'s writer column, which keys on the **root's type**, not on the level:
   - `$root` is an **initiative** → parent = the root; the tree is epics.
   - `$root` is an **epic** → parent = the root; the tree is stories beneath it (a broad discovery here means _more_ stories, not sub-epics).
   - `$root` is a **story** → parent = the root's **parent epic**; the tree is sibling stories, and the root joins the writer's existing-item registry as an **EXTEND target** (it already exists, so it is never a candidate).
   - No `$root` → parent = the initiative (broad) or epic (punctual) the placement points to, confirmed with the developer. If no such parent exists → **HALT** with a `/pair-process-plan-initiatives` (broad) or `/pair-process-plan-epics` (punctual) pointer; discovery never invents a parent.
7. **Act**: Triage the candidate tree against the **existing** backlog under that parent scope, per the shared [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) convention — extend-vs-create is decided against the existing tree, so discovery merges into the backlog instead of duplicating it. Compose the writer resolved in item 6, passing **both** the parent and the tree:
   - `/pair-process-plan-epics` with `$initiative: [the resolved initiative]` and `$candidates: [the candidate tree]` — then, for the slices under each confirmed epic, `/pair-process-plan-stories` with `$epic: [that epic]` and `$candidates: [its slices]`.
   - `/pair-process-plan-stories` with `$epic: [the resolved epic]` and `$candidates: [the candidate tree]`.

   `$candidates` is what stops the discovery's tree from being discarded: given it, both writers triage the **supplied** candidates instead of re-deriving their own from the parent (their Step 3 Check). Each still runs its own registry query and presents the **dry-run** proposal list — `ALREADY EXISTS #ID` (skip) | `EXTEND #ID` | `CREATE`, one per candidate with its rationale — for developer confirmation **before any write**. Brainstorm writes no issue itself.
8. **Act**: Items land as **Draft**: discovery produces planning units, and `/pair-process-refine-story` is what takes a story from Draft to Ready. Report a discovery that changes the product vision as a recommendation to run `/pair-process-specify-prd` — the PRD is never modified here.
9. **Verify**: Every candidate carries exactly one confirmed proposal; created/extended items are Draft, linked under the resolved parent (and to `$root` when given); `.pair/adoption/product/PRD.md` is unchanged.

## Output Format

```text
BRAINSTORM COMPLETE:
├── Scope:       [free theme: "<theme>" | root #ID: Title]
├── Level:       [broad | punctual] ([deduced from type/tags | asked | argument override])
├── Orientation: [functional | technical] ([deduced | override])
├── Phase 1:     [blob: N findings, M open items, K assumptions]
├── Phase 2:     [placement: subdomains/contexts touched | skipped — no map, no artifacts] · [conflicts: N flagged, N resolved]
├── Writer:      [/plan-epics | /plan-stories] under [#parent ID: Title] ([root | root's parent epic | placement])
├── Phase 3:     [Created: X · Extended: Y · Skipped: Z — all Draft]
├── PRD:         untouched
└── Next:        /refine-story on the first Draft story
```

## HALT Conditions

- **`$root` not found** (Step 0) — the id does not resolve to an issue; report it and stop, never guess a root.
- **No PM tool configured** (Phase 3) — phases 1–2 complete and keep their output; HALT with the `/pair-capability-setup-pm` pointer.
- **No parent to hang the tree from** (Phase 3, free-theme discovery only) — no initiative exists for a broad tree, or no epic for a punctual one; HALT with the `/pair-process-plan-initiatives` / `/pair-process-plan-epics` pointer rather than writing beneath an unrelated parent.
- **Unresolved domain conflict** (Phase 2) — a flagged conflict with a registered rule or DDR that the developer has not resolved; discovery never overrides a registered rule.
- **Developer rejects the tree** (Phase 3) — resolve the triage proposal before any write.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invoking `/pair-process-brainstorm` on a partially completed discovery is safe and expected — per-phase:

1. **Root, level, orientation, writer** (Step 0): re-deduced from the same root and tags — a deterministic read, never a re-ask; a prior override stated in the session (or passed as `$level`/`$orientation`) still wins.
2. **Phase 1 — interview**: detects a complete blob (session or `.pair/working/` handoff) and carries it forward; a partial handoff resumes from its first open item — answered items are never re-asked.
3. **Phase 2 — placement**: detects the blob's areas already present in `context-map.md` / the owning `subdomain/<slug>.context.md` and confirms them instead of re-composing `/map-*`; partial placement resumes at the first unrecorded area. Glossary/rule maintenance re-checks each term before adding it (Context Map Maintenance), so a re-run never duplicates an entry.
4. **Phase 3 — triage**: detects a tree already proposed for this discovery (confirmed list, or items under the resolved parent matching the candidates' idempotency keys) and re-presents that outcome; otherwise the composed writer's own `ALREADY EXISTS #ID` check makes the write a no-op per already-created candidate.
5. **PRD**: never written, so nothing to detect — the invariant holds on every run.

The skill resumes from the first incomplete phase — never re-does a completed one; idempotency ensures correct state.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill not installed → skip that step and note it; PM tool unreachable → ask the developer directly) for the standard scenarios. Additional cases:

- **`/pair-capability-grill` not installed** (Phase 1): warn and run the interview inline — one question per turn, each with a recommendation, ending only on explicit shared understanding — and assemble the blob from the answers. Discovery still completes.
- **`context-map.md` absent** (Phase 2): skip the Load/Check/Flag/Update-inline sequence and keep the scoped placement — its absence is the expected steady state, not an error, so phase 2 degrades without failing.
- **`/pair-capability-map-subdomains` / `/pair-capability-map-contexts` not installed, or no domain artifacts** (Phase 2): the blob still reaches phase 3; placement is skipped with a note, and the tree carries no subdomain/context annotation.
- **`/pair-process-plan-epics` / `/pair-process-plan-stories` not installed** (Phase 3): present the confirmed tree with its EXTEND/CREATE proposals for manual entry rather than writing issues from here.

## Notes

- **Phase order is fixed** (interview → domain → triage) and each phase's output feeds the next — a phase never runs on a blob the previous phase has not produced.
- **Composes, never re-derives**: the interview is `/pair-capability-grill`'s, the domain placement `/map-*`'s, the writes `/pair-process-plan-epics`/`/pair-process-plan-stories`' (which own the to-issues triage). Brainstorm owns the phase order and the level/orientation parametrization only (D24).
- **The writer is keyed on the root's type, not on the level** — `/pair-process-plan-epics` writes only under an initiative, `/pair-process-plan-stories` only under an epic — and it receives the discovery's tree explicitly as `$candidates`, so phase 2's output is what phase 3 triages rather than a tree the writer re-derives from its parent.
- **The PRD is never modified** — R3.4: discovery writes to the backlog and to domain context files; product-vision changes are surfaced as a `/pair-process-specify-prd` recommendation.
- **Modifies PM tool state** (phase 3, via the composed plan-* skills) **and adoption files** (phase 2, context map + domain catalogs).
- **Draft is the exit state**: the tree is a planning artifact — `/pair-process-refine-story` is the single Draft→Ready path (D24), and `/pair-next` picks the tree up from there.
