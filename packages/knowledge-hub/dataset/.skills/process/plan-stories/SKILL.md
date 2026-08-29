---
name: plan-stories
description: "Slices an epic into user stories via vertical slicing and INVEST validation, each sized for one sprint. Composes /write-issue."
version: 0.7.0
author: Foomakers
---

# /plan-stories — User Story Breakdown

Transform epics into user stories through vertical slicing, INVEST validation, and collaborative definition. Each story delivers end-to-end user value within a single sprint. Composes `/write-issue` for PM tool integration.

## Process Profile

<!-- process-step: id=plan-stories -->

Executable form of the **`plan-stories`** step. A **direct** invocation while a step is disabled by the project's profile warns and asks for confirmation; a **composed** one never prompts — it degrades exactly as a step that is not installed. No section ⇒ no-op. See [process-profile gate](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md).

## Composed Skills

| Skill          | Type       | Required                                                  |
| -------------- | ---------- | --------------------------------------------------------- |
| `/write-issue` | Capability | Yes — creates or updates story issues in the PM tool      |

## Arguments

| Argument       | Required | Description                                                                                                                                                                                 |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$epic`        | No       | Epic identifier (e.g., `#42`). If omitted, selects highest-priority Todo epic.                                                                                                              |
| `$candidates`  | No       | Caller-supplied candidate tree (story name + user value + rationale each, **plus** — optionally — the per-candidate adoption annotation the caller's own read produced: a `(per <record id>)` citation, a `Revisits <id>: <why>` label, or a drop with the record named) — e.g. the tree `/brainstorm`'s phase 3 hands over. When provided, Step 3 triages **these** candidates instead of deriving its own from the epic, and Step 4 persists any annotation carried here. |
| `$adoption-read` | No     | The caller's completed adoption read, in-band — the in-scope records with the effect already applied to each candidate (citation, `Revisits <id>` flag, or a drop with the record named). Supplied by a caller that performed the read itself (`/brainstorm` phase 3) so Step 2b inherits it instead of paying for a second, differently scoped read. **Honoured only together with `$candidates`**: the effects are computed against the caller's candidate set, so supplied alone it applies to nothing and Step 2b performs its own read as normal. |

## Algorithm

### Step 0: Prerequisite Check

1. **Check**: Prerequisites present?
   - Bootstrap complete: [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)
   - Epics exist in PM tool
   - [User story template](../../../.pair/knowledge/guidelines/collaboration/templates/user-story-template.md) available
2. **Skip**: If all present, proceed to Step 1.
3. **Act**: If any missing → **HALT**:

   > Prerequisites incomplete: [list missing]. Epics must exist before story breakdown.

4. **Verify**: way-of-working.md exists with project-specific content, epics exist in the PM tool, and the user-story-template.md file is reachable — the "prerequisites present" check from Step 0.

### Step 1: Epic Selection

1. **Check**: Is `$epic` provided?
2. **Skip**: If provided, load the epic from the PM tool. Proceed to Step 2.
3. **Act**: Query PM tool for epics in Todo state. Apply selection:
   - **Priority**: P0 > P1 > P2.
   - **Bootstrap rule**: if Epic 0 exists and is Todo, it must be broken down first.
   - **Dependencies**: prefer epics whose dependencies are complete.
4. **Act**: Present recommendation and ask developer to confirm:

   > Recommend breaking down Epic `#[ID]: [Title]` (Priority: [P0/P1/P2]).
   > Reason: [business value / sprint urgency / dependency chain].
   > Proceed?

5. **Verify**: An epic is identified (from `$epic` or developer confirmation) and its full content is available for Step 2's analysis.

### Step 2: Build Existing Story Registry

1. **Check**: Query PM tool for existing story issues linked to the selected epic — **including closed/Done items** (the closed-item triage rule in Step 3 depends on them being in the registry; many PM-tool queries default to open-only).
2. **Act**: Build a registry of existing stories, keyed for matching (idempotency key — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md)):

   ```text
   EXISTING STORIES:
   ├── #ID: [Title] (Status: [Todo/Refined/In Progress/Done])
   └── ...
   ```

3. **Verify**: Registry built — available to Step 3's triage.

### Step 2b: Adoption Context Read

1. **Check**: Is `$adoption-read` provided **together with `$candidates`**, and — if not — does the project carry adoption history (recorded decisions or a context map)?
2. **Skip**: If `$adoption-read` is provided **with** `$candidates`, that **is** this run's read: the caller already performed it on the same run and its scope is the run's scope (per the convention's reuse rule) — confirm the supplied effects with the candidates and go to Step 3, never re-deriving a second, differently scoped read that could drop a candidate the caller's own confirmation just approved. Supplied **without** `$candidates` it is not this run's read — its effects were computed for a candidate set this run does not have, so applying it to Step 3's derived candidates would make the pass a silent no-op: fall through to the Act and read as normal. If no adoption history exists (a fresh project, an empty decision log), note it in one line and proceed to Step 3: story generation is exactly what it was before this step, with no citations and no revisit flags.
3. **Act**: Read it per the shared [adoption-informed-generation.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/adoption-informed-generation.md) convention — **read-only**, bounded to the subject's scope, never a write. **This skill's subject**: the selected epic and the candidates derived from (or supplied for) it — the read is scoped to the subdomains, contexts, and terms that epic touches, never the project's whole history. Do not restate the convention's sources or precedence rules here; follow them there.
4. **Verify**: The in-scope records are available to Steps 3–4 with their ids, so a candidate can be constrained by one, **cite** it, or carry a `Revisits <id>` flag. Absence is a noted skip, never a HALT.

### Step 3: Story Identification & Triage Proposal

1. **Check**: Is `$candidates` provided?
2. **Skip**: If provided, that **is** this run's candidate tree — never re-derive it from the epic (a caller like `/brainstorm` already produced it from its own analysis, and re-deriving would discard it). Keep each candidate's rationale, apply only the vertical-slicing validation of item 4, and go to item 5's triage.
3. **Act**: If `$candidates` is absent, analyze epic components for story candidates (the candidate tree for this run):
   - **Workflow steps**: distinct user journey phases.
   - **CRUD operations**: create, read, update, delete patterns.
   - **Business rules**: different scenarios and conditions.
   - **User roles**: admin, member, guest variations.
4. **Act**: Apply vertical slicing — every story must deliver end-to-end user value with visible UI manifestation — to every candidate, supplied or derived. This rule governs CREATE candidates only — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md)'s per-skill-delta note.

   **Adoption-informed, same pass**: apply Step 2b's in-scope records to those same candidates — a candidate contradicting a live record is reshaped to fit it or dropped with that record named; a candidate re-proposing what a live record already rejected is not carried forward; a candidate that genuinely reopens one is kept and labelled `Revisits <id>: <one-line why>`, never silently contradicted. Generated wording uses the context map's registered terms rather than a synonym. Step 2b skipped (no adoption history) ⇒ this paragraph is a no-op.
5. **Act**: Triage each candidate story against the Step 2 registry — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) for the matching shape (idempotency key, EXTEND-vs-CREATE threshold, ambiguous-match and closed-item handling). **This skill's parent scope**: the selected epic. First, check each candidate's idempotency key against the registry: an exact match to an existing **open** story is `ALREADY EXISTS #ID` (skip) — per to-issues-triage.md's Skip step, not a triage decision. For every remaining candidate, classify `EXTEND #ID` or `CREATE` — or, if ambiguous (per to-issues-triage.md), present it as a question with a recommendation instead of silently picking one side. Present the triage proposal to developer:

   > Story candidates for Epic `#[ID]: [Title]`:
   >
   > 1. [Story name] — [user value] — [UI manifestation] → ALREADY EXISTS #[ID] (skip) | EXTEND #[ID] ([one-line rationale]) | CREATE ([one-line rationale]) [· per [decision id] | · Revisits [decision id]: [why]]
   > 2. [Story name] — [user value] — [UI manifestation] → Ambiguous: EXTEND #[ID] or CREATE? [recommendation + rationale]
   > ...
   > [Dropped by a recorded decision: [candidate] — [decision id] rejected this]
   >
   > Approve or adjust?

6. **Verify**: Developer approves the candidate list — every candidate carries exactly one proposal (`ALREADY EXISTS #ID` (skip), `EXTEND #ID`, `CREATE`, or an ambiguous question) with a rationale shown for EXTEND/CREATE, before any write. Every candidate a Step 2b record shaped shows that record — as a citation or a `Revisits` flag — in this same list, so the developer confirms the decisions applied, not just the slices.

### Step 4: Story Definition & INVEST Validation

For each approved story, per its Step 3 proposal:

1. **Check**: Is this story's confirmed Step 3 proposal `ALREADY EXISTS #ID` (skip)?
2. **Skip**: If so → skip, report:

   > Story `[Title]` already exists (#ID). Skipping.

3. **Act**: Define story scope using the Initial Breakdown section of [user-story-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/user-story-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)):
   - Story statement (As a / I want / So that).
   - Rough scope boundaries with expected uncertainty.
   - Initial sizing: XS(1), S(2), M(3), L(5), XL(8).
   - UI value manifestation for sprint demo readiness.
   - **Citations**: every part of the definition a Step 2b record shaped carries that record inline in the convention's form — `(per ADR-013)`, `(per decision-log/<date>-<topic>)`, `(per DDR-004)`, `(per context-map: <term>)`, the convention's complete list — and a confirmed revisit carries its `Revisits <id>: <why>` line. The citation lands in the story body, so the reader sees why the story is shaped that way without opening the adoption tree.
4. **Act**: For CREATE candidates, validate against INVEST criteria (existing rule, unaffected by triage):
   - **I**ndependent: can be planned separately.
   - **N**egotiable: focuses on user value, not implementation.
   - **V**aluable: clear benefit to user persona.
   - **E**stimable: scope clear enough for rough sizing.
   - **S**mall: fits within single sprint.
   - **T**estable: outcome can be verified.
5. **Act**: Compose `/write-issue` per the confirmed proposal:
   - **CREATE**: `$type: story`, `$content`: the story definition, `$parent`: the epic identifier. If the proposal referenced a closed story (per to-issues-triage.md's closed-item rule), include that reference in `$content`.
   - **EXTEND `#ID`**: `$type: story`, `$id: #ID`, `$content`: read the matched story's current full body from the PM tool (not just the Step 2 registry line) and merge the additional scope into it (idempotent — a no-op when the scope is already present, per to-issues-triage.md's body-merge idempotency, so re-runs don't accrete text), `$parent`: unchanged. Re-validate INVEST for the merged scope — extending must not break Independent/Small.
6. **Verify**: Story created or extended in PM tool. Record the ID. Linked to the epic (and, for a CREATE that referenced a closed item, to that closed-item reference) — hierarchy and references both present.

### Step 5: Coverage Validation & Completion

1. **Act**: Validate epic coverage:
   - All epic scope areas addressed by stories.
   - No critical gaps in user value delivery.
   - Epic objectives achievable through story completion.
2. **Act**: Report completion:

   > Epic coverage: [X]% of scope addressed.
   > Stories ready for backlog prioritization and future refinement.

3. **Verify**: Coverage validated.

## Output Format

```text
STORIES COMPLETE:
├── Epic:     [#ID: Title]
├── Total:    [N stories]
├── Created:  [X new]
├── Extended: [Y existing, scope merged]
├── Skipped:  [Z exact-match already-present]
├── Points:   [total estimated points]
├── Adoption: [N decisions cited · M revisits flagged | no adoption history]
├── INVEST:   [all CREATE candidates validated]
├── PM Tool:  [adopted tool]
└── Next:     /refine-story
```

The `Next:` line names only steps enabled by the project's [process profile](../../../.pair/knowledge/guidelines/technical-standards/ai-development/process-profiles.md): a disabled one is dropped, and when none is left the line names no skill.

## HALT Conditions

- **No epics in Todo state** (Step 1) — nothing to break down.
- **Epic not found** (Step 1) — invalid `$epic` identifier.
- **Bootstrap incomplete** (Step 0) — PM tool required.
- **Developer rejects candidates or triage proposal** (Step 3) — must resolve before creation.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill `/write-issue` not installed / PM tool not accessible → produce story documents, ask developer to create/enter manually) for the standard scenarios. Additional cases:

- If epic documentation is sparse, proceed with available context and flag gaps.
- **No adoption history, or an unreadable record** (Step 2b): adoption-informed generation degrades to today's behavior — stories are generated with no citations and no revisit flags; a single unparseable record is skipped with a warning naming it and the rest still apply. Never a HALT ([adoption-informed-generation.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/adoption-informed-generation.md)).

## Notes

- This skill **modifies PM tool state** — creates and extends story issues linked to epics.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) and [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md). This skill's check: exact idempotency-key match is proposed `ALREADY EXISTS #ID` (skip) at triage time, before any write (Step 3) — Step 4 only executes the confirmed proposal; substantial-overlap match proposes EXTEND instead of a duplicate CREATE (Step 3) — re-running the same candidate tree never duplicates.
- **Caller-supplied tree** — with `$candidates` (e.g. `/brainstorm` phase 3), Step 3 triages the supplied candidates and derives none: the caller owns the slicing, this skill owns triage, INVEST validation, and the writes. Without it, behaviour is unchanged.
- **Adoption-informed** (Step 2b) — the read is **read-only**: this skill never writes a decision record. Recording stays with the developer and `/record-decision`; what generation does with the records is constrain, cite, and flag a revisit, per the shared convention.
- Stories at breakdown stage are rough planning units — detailed requirements are added during `/refine-story`.
- INVEST validation is mandatory for CREATE candidates — stories failing INVEST must be reworked before creation. EXTEND candidates re-validate INVEST for the merged scope (Step 4).
