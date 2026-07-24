---
name: plan-stories
description: "Slices an epic into user stories via vertical slicing and INVEST validation, each sized for one sprint. Composes /write-issue."
version: 0.5.0
author: Foomakers
---

# /plan-stories — User Story Breakdown

Transform epics into user stories through vertical slicing, INVEST validation, and collaborative definition. Each story delivers end-to-end user value within a single sprint. Composes `/write-issue` for PM tool integration.

## Composed Skills

| Skill          | Type       | Required                                                  |
| -------------- | ---------- | --------------------------------------------------------- |
| `/write-issue` | Capability | Yes — creates or updates story issues in the PM tool      |

## Arguments

| Argument | Required | Description                                                                                  |
| -------- | -------- | -------------------------------------------------------------------------------------------- |
| `$epic`  | No       | Epic identifier (e.g., `#42`). If omitted, selects highest-priority Todo epic.               |

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

### Step 3: Story Identification & Triage Proposal

1. **Act**: Analyze epic components for story candidates (the candidate tree for this run):
   - **Workflow steps**: distinct user journey phases.
   - **CRUD operations**: create, read, update, delete patterns.
   - **Business rules**: different scenarios and conditions.
   - **User roles**: admin, member, guest variations.
2. **Act**: Apply vertical slicing — every story must deliver end-to-end user value with visible UI manifestation. This rule governs CREATE candidates only — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md)'s per-skill-delta note.
3. **Act**: Triage each candidate story against the Step 2 registry — see [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md) for the matching shape (idempotency key, EXTEND-vs-CREATE threshold, ambiguous-match and closed-item handling). **This skill's parent scope**: the selected epic. First, check each candidate's idempotency key against the registry: an exact match to an existing **open** story is `ALREADY EXISTS #ID` (skip) — per to-issues-triage.md's Skip step, not a triage decision. For every remaining candidate, classify `EXTEND #ID` or `CREATE` — or, if ambiguous (per to-issues-triage.md), present it as a question with a recommendation instead of silently picking one side. Present the triage proposal to developer:

   > Story candidates for Epic `#[ID]: [Title]`:
   >
   > 1. [Story name] — [user value] — [UI manifestation] → ALREADY EXISTS #[ID] (skip) | EXTEND #[ID] ([one-line rationale]) | CREATE ([one-line rationale])
   > 2. [Story name] — [user value] — [UI manifestation] → Ambiguous: EXTEND #[ID] or CREATE? [recommendation + rationale]
   > ...
   >
   > Approve or adjust?

4. **Verify**: Developer approves the candidate list — every candidate carries exactly one proposal (`ALREADY EXISTS #ID` (skip), `EXTEND #ID`, `CREATE`, or an ambiguous question) with a rationale shown for EXTEND/CREATE, before any write.

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
├── INVEST:   [all CREATE candidates validated]
├── PM Tool:  [adopted tool]
└── Next:     /refine-story
```

## HALT Conditions

- **No epics in Todo state** (Step 1) — nothing to break down.
- **Epic not found** (Step 1) — invalid `$epic` identifier.
- **Bootstrap incomplete** (Step 0) — PM tool required.
- **Developer rejects candidates or triage proposal** (Step 3) — must resolve before creation.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill `/write-issue` not installed / PM tool not accessible → produce story documents, ask developer to create/enter manually) for the standard scenarios. Additional cases:

- If epic documentation is sparse, proceed with available context and flag gaps.

## Notes

- This skill **modifies PM tool state** — creates and extends story issues linked to epics.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md) and [to-issues-triage.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md). This skill's check: exact idempotency-key match is proposed `ALREADY EXISTS #ID` (skip) at triage time, before any write (Step 3) — Step 4 only executes the confirmed proposal; substantial-overlap match proposes EXTEND instead of a duplicate CREATE (Step 3) — re-running the same candidate tree never duplicates.
- Stories at breakdown stage are rough planning units — detailed requirements are added during `/refine-story`.
- INVEST validation is mandatory for CREATE candidates — stories failing INVEST must be reworked before creation. EXTEND candidates re-validate INVEST for the merged scope (Step 4).
