# How to Breakdown User Stories - AI-Assisted Guide

## Overview

Transform epics into user story breakdowns through vertical slicing and INVEST validation. User stories serve as rough plannable units that capture user value with intentional uncertainty to be resolved during future refinement.

**Role**: Product Engineer & Product Owner/Manager (Epic Decomposition)
**Process**: AI proposes & structures, Developer validates & approves
**Skill**: When `/plan-stories` is available, invoke it — it automates the operational steps of this workflow (epic selection, story identification, INVEST validation, PM tool creation). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to orchestrates the `/plan-stories` skill.

| Skill            | Purpose                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `/plan-stories`  | Executes the full process: epic selection, story identification, INVEST validation, story creation.       |
| `/write-issue`   | Composed by `/plan-stories` — creates or updates story issues in the PM tool.                             |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: bootstrap complete per [way-of-working.md](../../adoption/tech/way-of-working.md), epics exist in PM tool, [user story template](../guidelines/collaboration/templates/user-story-template.md) available.
2. **Invoke `/plan-stories`** with optional `$epic` argument. The skill handles:
   - Existing story detection (idempotent — skips already-created)
   - Epic selection (highest-priority Todo, or specified `$epic`)
   - Story identification (workflow steps, CRUD, business rules, user roles)
   - Vertical slicing — every story delivers end-to-end user value with UI manifestation
   - INVEST validation (Independent, Negotiable, Valuable, Estimable, Small, Testable)
   - Story creation via `/write-issue` with `$type: story`
   - Epic coverage validation
3. **Developer validates** story candidates when prompted.
4. **Re-invoke** to create missing stories for the same or different epic.

## Manual Workflow (without skills)

### Phase 1: Foundation & Epic Selection

- Verify bootstrap complete, PM tool configured
- Select epic: P0 > P1 > P2 in Todo state
- **Bootstrap Epic Rule**: if Epic 0 exists, must break down first

### Phase 2: Story Identification

- Analyze epic for story candidates using patterns:
  - **Workflow Steps** — distinct user journey phases
  - **CRUD Operations** — create, read, update, delete patterns
  - **Business Rules** — different scenarios and conditions
  - **User Roles** — admin, member, guest variations
- Apply **vertical slicing** — every story produces visible UI value
- Present candidates for developer approval

### Phase 3: Story Definition & INVEST Validation

For each approved story:

- Define: story statement (As a / I want / So that), rough scope, initial sizing XS(1)/S(2)/M(3)/L(5)/XL(8)
- Validate INVEST:
  - **I**ndependent — can be planned separately
  - **N**egotiable — focuses on user value, not implementation
  - **V**aluable — clear benefit to user persona
  - **E**stimable — scope clear enough for rough sizing
  - **S**mall — fits within single sprint
  - **T**estable — outcome can be verified
- Reference [User Story Template](../guidelines/collaboration/templates/user-story-template.md) (Initial Breakdown section)

### Phase 4: Documentation & Tool Creation

- Document using [User Story Template](../guidelines/collaboration/templates/user-story-template.md)
- Create in PM tool with proper epic → story hierarchy
- Validate epic coverage (all scope areas addressed)

## HALT Conditions

- **No epics in Todo state** — nothing to break down
- **Epic not found** — invalid identifier
- **Bootstrap incomplete** — PM tool required
- **Developer rejects candidates** — must resolve before creation

## Key Principles

- **Vertical slicing** — each story delivers end-to-end value, not horizontal layers
- **UI-first cutting** — every story produces visible, demonstrable value for sprint review
- **INVEST mandatory** — stories failing INVEST must be reworked before creation
- **Rough planning units** — intentional uncertainty resolved during refinement
- **Epic coverage** — all epic scope areas must be addressed by stories
- **Idempotent** — re-invocation detects existing stories, creates only missing ones

## References

- Template: [User Story Template](../guidelines/collaboration/templates/user-story-template.md)
- Input: [Epic Breakdown](06-how-to-breakdown-epics.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- INVEST: [Scrum Guidelines](../guidelines/collaboration/methodology/scrum.md)
- Bootstrap: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)
- Next: [Refine User Stories](08-how-to-refine-a-user-story.md)
