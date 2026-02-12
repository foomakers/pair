# How to Refine a User Story - AI-Assisted Guide

## Overview

Transform User Stories from rough breakdown units into development-ready specifications through collaborative analysis and detailed requirements gathering. Story refinement converts intentional uncertainty into comprehensive acceptance criteria and technical clarity.

**Role**: Product Engineer & Product Owner/Manager (Requirements Analysis)
**Process**: AI analyzes & proposes, Developer validates & approves

## Skill Composition

This how-to orchestrates the `/pair-process-refine-story` skill.

| Skill           | Purpose                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/pair-process-refine-story` | Executes the full refinement process: selection, requirements (Given-When-Then), technical analysis, sprint readiness, documentation. Section-level idempotent. |
| `/pair-capability-write-issue`  | Composed by `/pair-process-refine-story` — creates or updates the story issue in the PM tool.                                                                                |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: PM tool configured per [way-of-working.md](../../adoption/tech/way-of-working.md), stories exist in Todo state from [story breakdown](07-how-to-breakdown-user-stories.md).
2. **Invoke `/pair-process-refine-story`** with optional `$story` argument. The skill handles:
   - Story selection (highest-priority Todo, or specified `$story`)
   - Section-level idempotency detection (resumes from first missing section)
   - Requirements analysis (Given-When-Then acceptance criteria, business rules, edge cases)
   - Technical analysis (architecture alignment, risks, spike identification)
   - Sprint readiness (re-estimation, split if oversized, dependency mapping)
   - Documentation and PM tool update via `/pair-capability-write-issue`
3. **Developer validates** each phase when prompted by the skill.
4. **Repeat** for each story requiring refinement.

## Manual Workflow (without skills)

### Phase 1: Story Selection

- Select highest-priority Todo story (P0 > P1 > P2)
- Consider sprint needs, dependency chains, epic context
- Present recommendation with rationale; confirm with developer

### Phase 2: Requirements Analysis

- Expand scope into Given-When-Then acceptance criteria
- Identify business rules with measurable criteria
- Address edge cases and error handling
- Define user experience and interaction details
- Reference [User Story Template](../guidelines/collaboration/templates/user-story-template.md) for structure

### Phase 3: Technical Analysis

- Define implementation strategy aligned with [architecture.md](../../adoption/tech/architecture.md)
- Identify components, integration points, data flow
- Assess risks and unknowns; propose spikes if needed
- Reference [tech-stack.md](../../adoption/tech/tech-stack.md) for implementation choices

### Phase 4: Sprint Readiness

- Re-estimate with detailed requirements: XS(1), S(2), M(3), L(5), XL(8)
- Split if oversized — each split must preserve end-to-end user value and INVEST compliance
- Map dependencies (prerequisite and dependent stories)
- Define validation and testing strategy

### Phase 5: Documentation & Tool Update

- Complete all sections of [User Story Template](../guidelines/collaboration/templates/user-story-template.md) (Refined template)
- Section ordering: functional first, technical last
- Update story status from Todo to Refined in PM tool
- Configure sizing, priority, dependency metadata

## Quality Checklist

- [ ] Story selected based on priority and sprint needs
- [ ] Acceptance criteria comprehensive and testable (Given-When-Then)
- [ ] Technical approach and risks analyzed
- [ ] Story sized for sprint or split with value preservation
- [ ] All uncertainties resolved
- [ ] [User Story Template](../guidelines/collaboration/templates/user-story-template.md) completed
- [ ] PM tool updated with Refined status
- [ ] INVEST criteria verified

## HALT Conditions

- **No Todo stories** — must have stories from breakdown phase
- **PM tool not configured** — complete [bootstrap](02-how-to-complete-bootstrap-checklist.md) first
- **Template not reviewed** — read [User Story Template](../guidelines/collaboration/templates/user-story-template.md) before starting

## Key Principles

- **Transform uncertainty into clarity** — resolve all open questions
- **Given-When-Then for all ACs** — every criterion must be specific and testable
- **INVEST compliance** — Independent, Negotiable, Valuable, Estimable, Small, Testable
- **Split preserves value** — each split delivers end-to-end user value
- **Functional first, technical last** — template section ordering
- **Re-invoke safely** — `/pair-process-refine-story` is section-level idempotent

## References

- Input: [Story Breakdown](07-how-to-breakdown-user-stories.md)
- Template: [User Story Template](../guidelines/collaboration/templates/user-story-template.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- Architecture: [Architecture Guidelines](../guidelines/architecture/architectural-patterns/README.md)
- Estimation: [Story Estimation Guidelines](../guidelines/collaboration/estimation/README.md)
- Next: [Create Tasks](09-how-to-create-tasks.md)
