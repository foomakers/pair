# How to Refine a User Story - AI-Assisted Guide

## Overview

Transform User Stories from rough breakdown units into development-ready specifications through collaborative analysis and detailed requirements gathering. Story refinement converts intentional uncertainty into comprehensive acceptance criteria and technical clarity.

**Role**: Product Engineer & Product Owner/Manager (Requirements Analysis)
**Process**: AI analyzes & proposes, Developer validates & approves

## Skill Composition

This how-to orchestrates the `/refine-story` skill.

| Skill           | Purpose                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/refine-story` | Executes the full refinement process: phase 0 grill sync, requirements (Given-When-Then), technical analysis, classification, sprint readiness, documentation. Section-level idempotent. |
| `/grill`        | Composed by `/refine-story` — phase 0 blocking AI↔human shared-understanding sync before any DoR section is authored (R3.11 alignment gate).                     |
| `/map-subdomains` + `/map-contexts` | Composed by `/refine-story` — scoped domain/context placement for the story; feeds the classification matrix and the coupling dimension. |
| `/classify`     | Composed by `/refine-story` — writes the shift-left classification (risk/cost) matrix into the story's `## Classification` section.                              |
| `/write-issue`  | Composed by `/refine-story` — creates or updates the story issue in the PM tool.                                                                                |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: PM tool configured per [way-of-working.md](../../adoption/tech/way-of-working.md), stories exist in the Draft macrostate from [story breakdown](07-how-to-breakdown-user-stories.md).
2. **Invoke `/refine-story`** with optional `$story` argument. The skill handles:
   - Story selection (highest-priority Draft, or specified `$story`)
   - **Phase 0 shared-understanding sync** via `/grill` — a blocking R3.11 alignment gate; no DoR section is authored until AI and human agree (HALT otherwise)
   - Section-level idempotency detection (resumes from first missing section)
   - Requirements analysis (Given-When-Then acceptance criteria, business rules, edge cases)
   - Technical analysis (architecture alignment, risks, spike identification) with scoped `/map-subdomains` + `/map-contexts` placement
   - Classification matrix via `/classify` written into the story's `## Classification` section
   - Sprint readiness (re-estimation, split if oversized, dependency mapping)
   - Documentation and PM tool update via `/write-issue`
3. **Developer validates** each phase when prompted by the skill.
4. **Repeat** for each story requiring refinement.

## Manual Workflow (without skills)

### Phase 0: Shared-Understanding Sync

- Before authoring any DoR section, establish explicit AI↔human shared understanding on goal, acceptance criteria, edge cases, dependencies, design, and risks (R3.11 alignment gate)
- Without `/grill`, the per-phase developer approval gates below are the accepted fallback — but alignment before the story reaches Ready is never skipped

### Phase 1: Story Selection

- Select highest-priority Draft story (P0 > P1 > P2)
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

- Complete all sections of [User Story Template](../guidelines/collaboration/templates/user-story-template.md) (Refined template), including the `## Classification` matrix
- Section ordering: functional first, technical last
- Transition the story from Draft to Ready in the PM tool
- Configure sizing, priority, dependency metadata

## Quality Checklist

- [ ] Story selected based on priority and sprint needs
- [ ] Acceptance criteria comprehensive and testable (Given-When-Then)
- [ ] Technical approach and risks analyzed
- [ ] Story sized for sprint or split with value preservation
- [ ] All uncertainties resolved
- [ ] [User Story Template](../guidelines/collaboration/templates/user-story-template.md) completed
- [ ] PM tool updated to Ready
- [ ] INVEST criteria verified

## HALT Conditions

- **No Draft stories** — must have stories from breakdown phase
- **PM tool not configured** — complete [bootstrap](02-how-to-complete-bootstrap-checklist.md) first
- **Template not reviewed** — read [User Story Template](../guidelines/collaboration/templates/user-story-template.md) before starting

## Key Principles

- **Transform uncertainty into clarity** — resolve all open questions
- **Given-When-Then for all ACs** — every criterion must be specific and testable
- **INVEST compliance** — Independent, Negotiable, Valuable, Estimable, Small, Testable
- **Split preserves value** — each split delivers end-to-end user value
- **Functional first, technical last** — template section ordering
- **Re-invoke safely** — `/refine-story` is section-level idempotent

## References

- Input: [Story Breakdown](07-how-to-breakdown-user-stories.md)
- Template: [User Story Template](../guidelines/collaboration/templates/user-story-template.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- Architecture: [Architecture Guidelines](../guidelines/architecture/architectural-patterns/README.md)
- Estimation: [Story Estimation Guidelines](../guidelines/collaboration/estimation/README.md)
- Next: [Create Tasks](09-how-to-create-tasks.md)
