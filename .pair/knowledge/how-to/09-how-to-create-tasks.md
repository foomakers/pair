# How to Create Tasks - AI-Assisted Guide

## Overview

Transform refined User Stories into specific, actionable development tasks through structured analysis and technical breakdown. Tasks serve as concrete implementation steps that translate acceptance criteria into executable work following established technical guidelines and architectural patterns.

**Role**: Product Engineer (Story Implementation Planning)
**Process**: AI proposes & structures, Developer validates & approves

## Skill Composition

This how-to orchestrates the `/pair-process-plan-tasks` skill.

| Skill          | Purpose                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/pair-process-plan-tasks`  | Executes the full task breakdown: story analysis, task identification, task definition, documentation. Task-level idempotent. |
| `/pair-capability-write-issue` | Composed by `/pair-process-plan-tasks` — creates task issues and updates the story body in the PM tool.                                    |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: PM tool configured per [way-of-working.md](../../adoption/tech/way-of-working.md), story is in Refined state with clear acceptance criteria.
2. **Invoke `/pair-process-plan-tasks`** with optional `$story` argument. The skill handles:
   - Story selection (highest-priority Refined, or specified `$story`)
   - Existing task detection (task-level idempotency — creates only missing tasks)
   - Technical context analysis (architecture, tech-stack, bounded contexts)
   - Task identification (AC-to-task mapping, bounded context grouping)
   - Task definition (full task template per task)
   - Task Breakdown appending (condensed TA + checklist + Dependency Graph + AC Coverage + detailed tasks)
   - PM tool update via `/pair-capability-write-issue`
3. **Developer validates** task list and definitions when prompted.
4. **Repeat** for each story requiring task breakdown.

## Manual Workflow (without skills)

### Phase 1: Foundation Verification

- Verify PM tool configuration per [way-of-working.md](../../adoption/tech/way-of-working.md)
- Confirm story is in Refined state with acceptance criteria
- **HALT** if story not refined or PM tool not configured

### Phase 2: Story Selection

- Select highest-priority Refined story (P0 > P1 > P2)
- Verify acceptance criteria completeness
- Present recommendation; confirm with developer

### Phase 3: Technical Context Analysis

- Review [architecture.md](../../adoption/tech/architecture.md), [tech-stack.md](../../adoption/tech/tech-stack.md)
- Map story to [bounded contexts](../../adoption/tech/boundedcontext/)
- Identify affected modules and integration points

### Phase 4: Task Identification & Decomposition

- Map each acceptance criterion to one or more tasks
- Group tasks by bounded context
- Classify task types: Development, Documentation, Configuration, Research
- Identify dependencies between tasks
- Ensure 100% AC coverage

### Phase 5: Task Definition

For each task, follow the [Task Template](../guidelines/collaboration/templates/task-template.md):

- Task info (ID, priority, hours, bounded context)
- Summary, type, description
- Acceptance criteria (deliverable, quality, integration, verification)
- Implementation approach (design, modules, files, standards)
- Dependencies, implementation steps, testing strategy

### Phase 6: Documentation & Tool Creation

Append Task Breakdown to story body (do not modify existing content):

- Condensed Technical Analysis (strategy, data flow, risks)
- Task checklist: `- [ ] **T-N**: [Title]`
- Dependency Graph (ASCII block)
- AC Coverage table (maps each AC to covering tasks)
- Detailed task definitions (per [Task Template](../guidelines/collaboration/templates/task-template.md))

See the **Task Breakdown Format for Story Body** section in [task-template.md](../guidelines/collaboration/templates/task-template.md) for the exact format.

### Phase 7: Coverage Validation

- All acceptance criteria addressed by at least one task
- Dependencies identified and execution order defined
- Technical standards referenced in each task
- Story coverage validated

## Quality Checklist

- [ ] Story refinement verified (Refined state)
- [ ] Task identification from acceptance criteria mapping
- [ ] All tasks specify bounded context and affected modules
- [ ] Technical standards referenced in each task
- [ ] Task Breakdown appended to story body (checklist + Dependency Graph + AC Coverage + details)
- [ ] Template structure followed for each task
- [ ] Story coverage validated — all ACs addressed
- [ ] Checkboxes only in task list, not in task detail sections

## HALT Conditions

- **Story not refined** — must be in Refined state. Suggest `/pair-process-refine-story`.
- **PM tool not configured** — complete [bootstrap](02-how-to-complete-bootstrap-checklist.md) first.
- **Bounded context unknown** — verify [bounded context docs](../../adoption/tech/boundedcontext/).

## Key Principles

- **AC-driven decomposition** — every task traces back to acceptance criteria
- **Bounded context mapping** — each task specifies its implementation domain
- **Task-level idempotency** — re-invoke safely; existing tasks are detected and skipped
- **Append only** — never modify existing story content; add Task Breakdown at end
- **Checkboxes for tracking** — only in the task list, not in task detail sections
- **Condensed TA** — Technical Analysis is condensed (strategy + data flow + risks), not removed
- **Standards references** — every task references relevant guidelines

## References

- Input: [Story Refinement](08-how-to-refine-a-user-story.md)
- Task Template: [Task Template](../guidelines/collaboration/templates/task-template.md)
- Story Template: [User Story Template](../guidelines/collaboration/templates/user-story-template.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- Architecture: [Architecture Guidelines](../guidelines/architecture/README.md)
- Code Design: [Code Design Guidelines](../guidelines/code-design/README.md)
- Testing: [Testing Strategy](../guidelines/testing/test-strategy/README.md)
- Next: [Implement a Task](10-how-to-implement-a-task.md)
