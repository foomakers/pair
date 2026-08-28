---
name: plan-epics
description: "Breaks a strategic initiative into epics — each delivering end-to-end value in 2-4 sprints — through structured analysis and validation. Composes /write-issue. Not for filing a single epic issue from text you already wrote (that's /write-issue directly)."
version: 0.7.0
author: Foomakers
---

# /plan-epics — Epic Breakdown

Transform strategic initiatives into comprehensive epic breakdowns. Each epic delivers end-to-end user value in 2-4 sprints. Composes `/write-issue` for PM tool integration.

## Process Profile

<!-- process-step: id=plan-epics -->

Executable form of the **`plan-epics`** step, and a composer of `define-subdomains`. A **direct** invocation while a step is disabled by the project's profile warns and asks for confirmation; a **composed** one never prompts — it degrades exactly as a step that is not installed. No section ⇒ no-op. See [process-profile gate](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md).

## Composed Skills

| Skill          | Type       | Required                                                  |
| -------------- | ---------- | --------------------------------------------------------- |
| `/write-issue` | Capability | Yes — creates or updates epic issues in the PM tool       |
| `/map-subdomains` | Capability | Optional — scoped domain mapping for the approved epic breakdown. Graceful degradation if absent. |

## Arguments

| Argument       | Required | Description                                                                                                                                                                                        |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$initiative`  | No       | Initiative identifier (e.g., `#10`). If omitted, selects highest-priority Todo initiative.                                                                                                         |
| `$candidates`  | No       | Caller-supplied candidate tree (epic name + user value + rationale each, **plus** — optionally — the per-candidate adoption annotation the caller's own read produced: a `(per <record id>)` citation, a `Revisits <id>: <why>` label, or a drop with the record named) — e.g. the tree `/brainstorm`'s phase 3 hands over. When provided, Step 3 triages **these** candidates instead of deriving its own from the initiative, shows the annotation in its dry-run prompt, and Step 4 persists it into the epic body. This skill runs no adoption read of its own, so an annotation absent here is an annotation the epic will not carry. |
| `$domain-placed` | No     | Capability areas the **caller** has already placed **or confirmed** in the subdomain catalog for this run (e.g. `/brainstorm` phase 2). When it covers the approved breakdown's areas, Step 3.5 confirms that placement instead of re-composing `/map-subdomains` — one subdomain-catalog delta per run, not two. Carried in-band precisely so the fact survives a fresh session, rather than depending on same-session context. |

## Algorithm

### Step 0: Prerequisite Check

1. **Check**: Prerequisites present?
   - Bootstrap complete: [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md), PRD, architecture, tech-stack
   - Initiatives exist in PM tool
   - Bounded contexts defined (recommended, not required): [`adoption/tech/boundedcontext/`](../../../.pair/adoption/tech/boundedcontext/)
2. **Skip**: If all present, proceed to Step 1.
3. **Act**: If bootstrap incomplete → **HALT**. If bounded contexts missing, warn and proceed.
4. **Verify**: way-of-working.md, the PRD, architecture.md, and tech-stack.md each exist with project-specific (non-template) content, and a PM-tool query for initiatives succeeds — the "prerequisites present" check from Step 0.1.

### Step 1: Initiative Selection

1. **Check**: Is `$initiative` provided?
2. **Skip**: If provided, load the initiative from the PM tool. Proceed to Step 2.
3. **Act**: Query PM tool for initiatives in Todo state. Apply selection:
   - **Priority**: P0 > P1 > P2.
   - **Dependencies**: prefer initiatives whose dependencies are complete.
4. **Act**: Present recommendation and ask developer to confirm:

   > Recommend breaking down Initiative `#[ID]: [Title]` (Priority: [P0/P1/P2]).
   > Reason: [business value / readiness / dependency chain].
   > Proceed?

5. **Verify**: An initiative is identified (from `$initiative` or developer confirmation) and its full content is available for Step 2's analysis.

### Step 2: Build Existing Epic Registry

1. **Check**: Query PM tool for existing epic issues linked to the selected initiative — **including closed/Done items** (the closed-item triage rule in Step 3 depends on them being in the registry; many PM-tool queries default to open-only).
2. **Act**: Build a registry of existing epics, keyed for matching (idempotency key — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md)):

   ```text
   EXISTING EPICS:
   ├── #ID: [Title] (Status: [Todo/In Progress/Done])
   └── ...
   ```

3. **Verify**: Registry built — available to Step 3's triage.

### Step 3: Epic Analysis & Triage Proposal

1. **Check**: Is `$candidates` provided?
2. **Skip**: If provided, that **is** this run's candidate tree — never re-derive it from the initiative (a caller like `/brainstorm` already produced it from its own analysis, and re-deriving would discard it). Keep each candidate's rationale, apply only the sizing/sequencing checks of item 4, and go to item 5's triage.
3. **Act**: If `$candidates` is absent, analyze initiative components:
   - Business objectives and success metrics.
   - User value propositions and journey stages.
   - Technical requirements from architecture and tech-stack.
   - Bounded context alignment for service boundaries.
4. **Act**: Determine epic structure (the candidate tree for this run; with `$candidates`, validate the supplied tree against these same criteria instead of building one):
   - **Epic 0 assessment**: for new projects, assess if bootstrap epic is needed.
   - **Value-driven grouping**: natural feature groupings following user workflows.
   - **Sequential dependencies**: foundation-first, user journey progression.
   - **Duration sizing**: 2-4 sprints per epic with clear completion criteria.
5. **Act**: Triage each candidate epic against the Step 2 registry — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) for the matching shape (idempotency key, EXTEND-vs-CREATE threshold, ambiguous-match and closed-item handling). **This skill's parent scope**: the selected initiative. First, check each candidate's idempotency key against the registry: an exact match to an existing **open** epic is `ALREADY EXISTS #ID` (skip) — per to-issues-triage.md's Skip step, not a triage decision. For every remaining candidate, classify `EXTEND #ID` or `CREATE` — or, if ambiguous (per to-issues-triage.md), present it as a question with a recommendation instead of silently picking one side. Present the triage proposal to developer:

   > Epic breakdown for Initiative `#[ID]: [Title]`:
   >
   > [Epic 0: Bootstrap (if needed)] → CREATE (first run) | ALREADY EXISTS #[ID] (skip, on re-run — Epic 0 follows the same triage rule as any other candidate)
   > Epic 1: [Name] (2-3 sprints) — [user value] → ALREADY EXISTS #[ID] (skip) | EXTEND #[ID] ([one-line rationale]) | CREATE ([one-line rationale]) [· per [decision id] | · Revisits [decision id]: [why]]
   > Epic 2: [Name] (3-4 sprints) — [user value] → Ambiguous: EXTEND #[ID] or CREATE? [recommendation + rationale]
   > ...
   > [Dropped by a recorded decision: [candidate] — [decision id] rejected this]
   >
   > Approve or adjust?

6. **Verify**: Developer approves the breakdown — every candidate carries exactly one proposal (`ALREADY EXISTS #ID` (skip), `EXTEND #ID`, `CREATE`, or an ambiguous question) with a rationale shown for EXTEND/CREATE, before any write.

### Step 3.5: Domain Mapping (scoped)

1. **Check**: Is `/map-subdomains` installed, and has the caller **already placed or confirmed this scope in this run** — declared in-band as `$domain-placed`?
2. **Skip**: If not installed → warn and proceed to Step 4 without domain mapping. If `$domain-placed` names the **same capability areas** the approved breakdown covers — the caller's own domain step either composed `/map-subdomains` on them or confirmed a placement already recorded (e.g. `/brainstorm` phase 2, **either** branch of its Check/Skip, so a fresh-session resume qualifies too) → **confirm that placement and proceed to Step 4; do not re-compose** `/map-subdomains`: the same scope is mapped once per run, and the developer approves **one** subdomain-catalog delta, not two.
3. **Act**: Otherwise compose `/map-subdomains` with `$scope` set to the capability area(s) covered by the approved epic breakdown (not `all` — full-catalog remapping stays `/bootstrap`-only).
4. **Verify**: Subdomain catalog delta (if any) approved by developer. Epic creation always proceeds to Step 4 regardless of the domain-mapping outcome.

### Step 4: Epic Creation

Process epics sequentially (Epic 0 first if needed), per its Step 3 proposal:

1. **Check**: Is this epic's confirmed Step 3 proposal `ALREADY EXISTS #ID` (skip)?
2. **Skip**: If so → skip, report:

   > Epic `[Title]` already exists (#ID). Skipping.

3. **Act**: Draft the epic following [epic-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/epic-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)):
   - Fill template sections: Epic Statement, Business Value, Solution Overview, Epic Breakdown, Technical Considerations.
   - **Citations**: when a `$candidates` tree arrives carrying them (a caller like `/brainstorm` applies its own adoption read before handing the tree over), every part of the draft a record shaped keeps that record inline — `(per ADR-013)`, `(per decision-log/<date>-<topic>)`, `(per DDR-004)`, `(per context-map: <term>)`, the convention's complete list — and a confirmed revisit keeps its `Revisits <id>: <why>` line. The citation lands in the epic body, so it survives the write instead of stopping at the confirmation list. This skill runs no adoption read of its own.
   - Present to developer for validation.
4. **Act**: Compose `/write-issue` per the confirmed proposal:
   - **CREATE**: `$type: epic`, `$content`: the filled epic template, `$parent`: the initiative identifier. If the proposal referenced a closed epic (per to-issues-triage.md's closed-item rule), include that reference in `$content`.
   - **EXTEND `#ID`**: `$type: epic`, `$id: #ID`, `$content`: read the matched epic's current full body from the PM tool (not just the Step 2 registry line) and merge the additional scope into it (idempotent — a no-op when the scope is already present, per to-issues-triage.md's body-merge idempotency, so re-runs don't accrete text), `$parent`: unchanged.
5. **Verify**: Epic created or extended in PM tool. Record the ID. Linked to the initiative (and, for a CREATE that referenced a closed item, to that closed-item reference) — hierarchy and references both present.

### Step 5: Completion

1. **Act**: Validate complete breakdown:
   - All epics documented. Epic sequence verified.
   - Initiative objectives fully covered by epic scope.
   - Tool hierarchy established (Initiative → Epics).
2. **Verify**: Breakdown complete.

## Output Format

```text
EPICS COMPLETE:
├── Initiative: [#ID: Title]
├── Total:      [N epics]
├── Created:    [X new]
├── Extended:   [Y existing, scope merged]
├── Skipped:    [Z exact-match already-present]
├── Sprints:    [estimated total sprints]
├── PM Tool:    [adopted tool]
└── Next:       /plan-stories
```

## HALT Conditions

- **Bootstrap incomplete** (Step 0) — PM tool and tech context required.
- **No Todo initiatives** (Step 1) — nothing to break down.
- **Initiative not found** (Step 1) — invalid `$initiative` identifier.
- **Developer rejects breakdown or triage proposal** (Step 3) — must resolve before creation.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill `/write-issue` not installed / PM tool not accessible → produce epic documents, ask developer to create manually) for the standard scenarios. Additional cases:

- If `/map-subdomains` is not installed, skip Step 3.5 with a warning — epic creation proceeds without domain mapping.
- If bounded contexts are not defined, proceed with PRD and initiative analysis only.

## Notes

- This skill **modifies PM tool state** — creates and extends epic issues linked to initiatives.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) and [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md). This skill's check: exact idempotency-key match is proposed `ALREADY EXISTS #ID` (skip) at triage time, before any write (Step 3) — Step 4 only executes the confirmed proposal; substantial-overlap match proposes EXTEND instead of a duplicate CREATE (Step 3) — re-running the same candidate tree never duplicates.
- **Caller-supplied tree** — with `$candidates` (e.g. `/brainstorm` phase 3), Step 3 triages the supplied candidates and derives none: the caller owns the grouping, this skill owns triage, the epic template, and the writes. Without it, behaviour is unchanged. Step 3.5 is a **confirm-only pass** on that path when `$domain-placed` names the same capability areas the caller already placed **or confirmed** in this run — one placement, one catalog delta to approve. The fact travels in the arguments, not in same-session context, so it holds when the caller itself resumed a partially completed run.
- Epic 0 rule: for new projects, always assess if a bootstrap/foundation epic is needed before functional epics.
- Domain mapping (Step 3.5) is scoped to this run's epic breakdown — see [map-subdomains](../../capability/map-subdomains/SKILL.md).
