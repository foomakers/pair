---
name: refine-story
description: >-
  Refines a user story from Todo to Refined state through structured phases:
  selection, requirements analysis (Given-When-Then), technical analysis, sprint
  readiness, and documentation. Section-level idempotency — detects partial
  refinement and resumes. Composes /write-issue for PM tool updates.
---

# /refine-story — Story Refinement

Transform a user story from rough breakdown (Todo) into a development-ready specification (Refined). Section-level idempotency: each refinement section is checked before acting — partial refinements resume from the first missing section.

## Composed Skills

| Skill | Type | Required |
|-------|------|----------|
| `/write-issue` | Capability | Yes — creates or updates the story issue in the PM tool |

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `$story` | No | Story identifier (e.g., `#42`). If omitted, the skill selects the highest-priority Todo story from the backlog. |

## Algorithm

### Step 0: Story Selection

1. **Check**: Is `$story` provided?
2. **Skip**: If provided, load the story from the PM tool and proceed to Step 1.
3. **Act**: If not provided, query the PM tool for stories in Todo state. Apply selection criteria:
   - **Priority**: P0 > P1 > P2
   - **Sprint need**: stories required for upcoming sprint
   - **Dependency chain**: stories blocking other work
4. **Act**: Present recommendation and ask developer to confirm:
   > Recommend refining Story `#[ID]: [Title]` (Priority: [P0/P1/P2]).
   > Reason: [business value / sprint urgency / unblocks other work].
   > Proceed?
5. **Verify**: Story selected and loaded.

### Step 1: Detect Refinement State

1. **Check**: Read the current story body and classify each section as **present** or **missing**:

   | Section | Detection |
   |---------|-----------|
   | Story Statement | Has `**As a**` / `**I want**` / `**So that**` with non-placeholder content |
   | Epic Context | Has `**Parent Epic**` with actual link |
   | Acceptance Criteria (Given-When-Then) | Has `**Given**` / `**When**` / `**Then**` blocks |
   | Business Rules | Has non-placeholder business rules |
   | Edge Cases | Has non-placeholder edge case handling |
   | Technical Analysis | Has `### Implementation Approach` or `### Strategy` with content |
   | Technical Risks | Has risk table with entries |
   | Definition of Done | Has DoD checklist with items |
   | Story Sizing | Has `**Final Story Points**` with value |
   | Dependencies | Has dependency information |
   | Validation Strategy | Has testing approach |

2. **Act**: Determine refinement state:
   - **All sections present** → story is already Refined. Offer selective update (Step 6).
   - **Some sections present** → partial refinement. Resume from first missing section (Steps 2–5).
   - **No sections (only Initial Breakdown)** → full refinement needed (Steps 2–5).
3. **Verify**: Refinement state determined. Report:
   > Refinement state: [N/M sections complete]. [Resuming from: Section X | Full refinement | Already refined — offering update].

### Step 2: Requirements Analysis

**Skip if**: Acceptance Criteria, Business Rules, and Edge Cases are all present.

1. **Act**: Expand the story scope into detailed, testable acceptance criteria:
   - Convert requirements into **Given-When-Then** scenarios.
   - Identify **business rules** with measurable criteria.
   - Address **edge cases** and error handling conditions.
2. **Act**: Present the proposed criteria to the developer for validation:
   > Proposed acceptance criteria for `#[ID]`:
   > [List Given-When-Then scenarios]
   > [Business rules]
   > [Edge cases]
   > Approve or adjust?
3. **Verify**: Developer approves. Criteria finalized.

### Step 3: Technical Analysis

**Skip if**: Technical Analysis and Technical Risks are present.

1. **Act**: Assess the implementation approach:
   - **Strategy**: high-level technical approach and architecture alignment.
   - **Key components**: modules, integration points, data flow.
   - **Risks**: technical unknowns, complexity, dependencies.
   - Reference [architecture.md](../../../.pair/adoption/tech/architecture.md) and [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md).
2. **Act**: Present technical analysis to developer for validation.
3. **Verify**: Developer approves. Analysis finalized.

### Step 4: Sprint Readiness

**Skip if**: Story Sizing, Dependencies, and Validation Strategy are present.

1. **Act**: Re-estimate story size with detailed requirements:
   - Apply refined sizing: XS(1), S(2), M(3), L(5), XL(8).
   - Assess sprint fit — split if oversized while preserving user value.
   - Map dependencies (prerequisite and dependent stories).
   - Define validation and testing strategy.
2. **Act**: Present sizing assessment to developer.
3. **Verify**: Developer approves. Sprint readiness confirmed.

### Step 5: Documentation and PM Tool Update

1. **Act**: Assemble the complete refined story body using the [user-story-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/user-story-template.md) Refined template:
   - **Functional sections first**: Story Statement → Epic Context → Acceptance Criteria → Definition of Done → Story Sizing → Dependencies → Validation → Notes.
   - **Technical sections last**: Technical Analysis → (Task Breakdown added later by `/plan-tasks`).
2. **Act**: Compose `/write-issue` with:
   - `$type: story`
   - `$content`: the assembled refined story body
   - `$id`: the story identifier (update mode — story already exists)
3. **Act**: Update story status from Todo to Refined in the PM tool.
4. **Verify**: Story updated in PM tool. Status is Refined.

### Step 6: Already-Refined Update (optional path)

Reached only when Step 1 detects all sections are present.

1. **Act**: Ask the developer which sections to update:
   > Story `#[ID]` is already refined. Which sections need updating?
   > 1. Acceptance Criteria
   > 2. Technical Analysis
   > 3. Sprint Sizing
   > 4. All sections
2. **Act**: For selected sections, re-execute the corresponding step (2, 3, or 4).
3. **Act**: Compose `/write-issue` with `$type: story`, `$id: [story-id]`, and updated `$content`.
4. **Verify**: Story updated.

## Output Format

```text
STORY REFINEMENT COMPLETE:
├── Story:    [#ID: Title]
├── Status:   [Refined | Updated]
├── Sections: [N/N complete]
├── Sizing:   [X points — fits sprint: Yes/No]
├── PM Tool:  [Issue updated — #ID]
└── Next:     /plan-tasks to create task breakdown
```

## HALT Conditions

- **No Todo stories in backlog** (Step 0) — nothing to refine.
- **Story not found** (Step 0) — invalid `$story` identifier.
- **PM tool not accessible** — cannot read or update stories.
- **Developer rejects criteria** (Steps 2–4) — must resolve before proceeding.

## Graceful Degradation

- If `/write-issue` is not installed, warn and provide the formatted story body for manual PM tool update.
- If the PM tool is not accessible, produce the refined story content and ask the developer to update manually.
- If adoption files (architecture, tech-stack) are not found, skip technical analysis alignment checks and warn.

## Notes

- This skill **modifies PM tool state** — it updates story issues.
- Section-level idempotency: re-invoking on a partially refined story resumes from the first missing section.
- Template ordering: functional sections first, technical sections last. This positions Technical Analysis as the bridge to Task Breakdown (added by `/plan-tasks`).
- INVEST validation: the refined story must satisfy Independent, Negotiable, Valuable, Estimable, Small, Testable criteria.
- The `/refine-story` skill handles the transition from Initial Breakdown template format to Refined template format.
