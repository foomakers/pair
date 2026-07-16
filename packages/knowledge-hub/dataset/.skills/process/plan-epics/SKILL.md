---
name: plan-epics
description: "Breaks a strategic initiative into epics — each delivering end-to-end value in 2-4 sprints — through structured analysis and validation. Composes /write-issue. Not for filing a single epic issue from text you already wrote (that's /write-issue directly)."
version: 0.5.0
author: Foomakers
---

# /plan-epics — Epic Breakdown

Transform strategic initiatives into comprehensive epic breakdowns. Each epic delivers end-to-end user value in 2-4 sprints. Composes `/write-issue` for PM tool integration.

## Composed Skills

| Skill          | Type       | Required                                                  |
| -------------- | ---------- | --------------------------------------------------------- |
| `/write-issue` | Capability | Yes — creates or updates epic issues in the PM tool       |
| `/map-subdomains` | Capability | Optional — scoped domain mapping for the approved epic breakdown. Graceful degradation if absent. |

## Arguments

| Argument      | Required | Description                                                                                           |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `$initiative` | No       | Initiative identifier (e.g., `#10`). If omitted, selects highest-priority Todo initiative.            |

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

1. **Check**: Query PM tool for existing epic issues linked to the selected initiative.
2. **Act**: Build a registry of existing epics, keyed for matching (idempotency key — see [to-issues-triage.md](../../../.pair/knowledge/skill-conventions/to-issues-triage.md)):

   ```text
   EXISTING EPICS:
   ├── #ID: [Title] (Status: [Todo/In Progress/Done])
   └── ...
   ```

3. **Verify**: Registry built — available to Step 3's triage.

### Step 3: Epic Analysis & Triage Proposal

1. **Act**: Analyze initiative components:
   - Business objectives and success metrics.
   - User value propositions and journey stages.
   - Technical requirements from architecture and tech-stack.
   - Bounded context alignment for service boundaries.
2. **Act**: Determine epic structure (the candidate tree for this run):
   - **Epic 0 assessment**: for new projects, assess if bootstrap epic is needed.
   - **Value-driven grouping**: natural feature groupings following user workflows.
   - **Sequential dependencies**: foundation-first, user journey progression.
   - **Duration sizing**: 2-4 sprints per epic with clear completion criteria.
3. **Act**: Triage each candidate epic against the Step 2 registry — see [to-issues-triage.md](../../../.pair/knowledge/skill-conventions/to-issues-triage.md) for the matching shape (idempotency key, EXTEND-vs-CREATE threshold, ambiguous-match and closed-item handling). **This skill's parent scope**: the selected initiative. First, check each candidate's idempotency key against the registry: an exact match to an existing **open** epic is `ALREADY EXISTS #ID` (skip) — per to-issues-triage.md's Skip step, not a triage decision. For every remaining candidate, classify `EXTEND #ID` or `CREATE`. Present the triage proposal to developer:

   > Epic breakdown for Initiative `#[ID]: [Title]`:
   >
   > [Epic 0: Bootstrap (if needed)] → CREATE
   > Epic 1: [Name] (2-3 sprints) — [user value] → ALREADY EXISTS #[ID] (skip) | EXTEND #[ID] ([one-line rationale]) | CREATE ([one-line rationale])
   > Epic 2: [Name] (3-4 sprints) — [user value] → ...
   > ...
   >
   > Approve or adjust?

4. **Verify**: Developer approves the breakdown — every candidate carries exactly one proposal (`ALREADY EXISTS #ID` (skip), `EXTEND #ID`, or `CREATE`) with a rationale shown for EXTEND/CREATE, before any write.

### Step 3.5: Domain Mapping (scoped)

1. **Check**: Is `/map-subdomains` installed?
2. **Skip**: If not installed → warn and proceed to Step 4 without domain mapping.
3. **Act**: Compose `/map-subdomains` with `$scope` set to the capability area(s) covered by the approved epic breakdown (not `all` — full-catalog remapping stays `/bootstrap`-only).
4. **Verify**: Subdomain catalog delta (if any) approved by developer. Epic creation always proceeds to Step 4 regardless of the domain-mapping outcome.

### Step 4: Epic Creation

Process epics sequentially (Epic 0 first if needed), per its Step 3 proposal:

1. **Check**: Is this epic's confirmed Step 3 proposal `ALREADY EXISTS #ID` (skip)?
2. **Skip**: If so → skip, report:

   > Epic `[Title]` already exists (#ID). Skipping.

3. **Act**: Draft the epic following [epic-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/epic-template.md):
   - Fill template sections: Epic Statement, Business Value, Solution Overview, Epic Breakdown, Technical Considerations.
   - Present to developer for validation.
4. **Act**: Compose `/write-issue` per the confirmed proposal:
   - **CREATE**: `$type: epic`, `$content`: the filled epic template, `$parent`: the initiative identifier. If the proposal referenced a closed epic (per to-issues-triage.md's closed-item rule), include that reference in `$content`.
   - **EXTEND `#ID`**: `$type: epic`, `$id: #ID`, `$content`: the additional scope merged into the existing epic template, `$parent`: unchanged.
5. **Verify**: Epic created or extended in PM tool. Record the ID. Linked to the initiative (and, for EXTEND, to the closed-item reference if any) — hierarchy and references both present.

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

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) (optional skill `/write-issue` not installed / PM tool not accessible → produce epic documents, ask developer to create manually) for the standard scenarios. Additional cases:

- If `/map-subdomains` is not installed, skip Step 3.5 with a warning — epic creation proceeds without domain mapping.
- If bounded contexts are not defined, proceed with PRD and initiative analysis only.

## Notes

- This skill **modifies PM tool state** — creates and extends epic issues linked to initiatives.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/skill-conventions/idempotency.md) and [to-issues-triage.md](../../../.pair/knowledge/skill-conventions/to-issues-triage.md). This skill's check: exact idempotency-key match is proposed `ALREADY EXISTS #ID` (skip) at triage time, before any write (Step 3) — Step 4 only executes the confirmed proposal; substantial-overlap match proposes EXTEND instead of a duplicate CREATE (Step 3) — re-running the same candidate tree never duplicates.
- Epic 0 rule: for new projects, always assess if a bootstrap/foundation epic is needed before functional epics.
- Domain mapping (Step 3.5) is scoped to this run's epic breakdown — see [map-subdomains](../../capability/map-subdomains/SKILL.md).
