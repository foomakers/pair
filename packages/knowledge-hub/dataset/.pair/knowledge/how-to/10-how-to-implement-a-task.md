# How to Implement a Task - AI-Assisted Guide

## Overview

Transform task specifications into working, tested code by implementing **exactly what is defined** in task breakdown without additions or modifications.

**Role**: Product Software Engineer (Implementation)
**Process**: AI implements, Developer reviews
**Skill**: When `/implement` is available, invoke it — it automates the operational steps of this workflow (branch creation, task iteration, commits, PR creation). This how-to describes the workflow and its HALT conditions.

**CRITICAL FIRST STEP**: Before any implementation work begins, complete Phase 0: Story & Task Analysis to fully understand what needs to be implemented.

## Session State Management

**CRITICAL**: Maintain this context throughout implementation:

```text
IMPLEMENTATION STATE:
├── Current Story: [STORY-ID: Story Title]
├── Active Task: [TASK-ID: Task Title]
├── Task Type: [Development | Documentation | Configuration | Research]
├── Implementation Mode: [TDD | Direct Implementation]
├── TDD Phase: [RED | GREEN | REFACTOR | COMPLETE | N/A]
├── Branch: [feature/#story-id-description]
├── Commit Strategy: [per-task | per-story]
└── Next Action: [specific next step]
```

## Core Principles

### Task-First Implementation

- **Implement ONLY** what is specified in the active task per the [task template](../guidelines/collaboration/templates/task-template.md)
- **No arbitrary additions** — if something seems missing, HALT and request task updates
- **Use ONLY specified libraries** — never add libraries not listed in [tech-stack.md](../../adoption/tech/tech-stack.md) or the task specification
- **Validate against task acceptance criteria** before considering complete

### Technical Alignment

- **Architecture**: Follow [adopted architecture](../../adoption/tech/architecture.md)
- **Technology Stack**: Use ONLY libraries/versions from [tech-stack.md](../../adoption/tech/tech-stack.md)
- **Development Process**: Follow [way-of-working.md](../../adoption/tech/way-of-working.md)
- **Code Design**: Apply [code design guidelines](../guidelines/code-design/README.md)
- **Testing**: Follow [test strategy](../guidelines/testing/test-strategy/README.md)

## Prerequisites & HALT Conditions

### Critical Blockers (HALT if not met)

- **Clean Git**: No uncommitted changes, on main branch (before starting)
- **PM Tool Configured**: Must exist in [way-of-working.md](../../adoption/tech/way-of-working.md)
- **Story Analysis Complete**: Phase 0 must be completed before any other work
- **Story in "In Progress" state** and assigned to the implementing developer
- **All tasks complete** per [task template](../guidelines/collaboration/templates/task-template.md) — every task must have implementation approach, acceptance criteria, and development workflow
- **Libraries clear** — no ambiguity about which libraries to use

### Access Requirements

Follow [project management tool guidelines](../guidelines/collaboration/project-management-tool/README.md) for tool-specific access based on the configured tool in [way-of-working.md](../../adoption/tech/way-of-working.md).

## Implementation Methodology

### Task Type Classification

Based on [task template](../guidelines/collaboration/templates/task-template.md):

**Development Tasks (TDD Required):** Feature implementation, Bug fix, Refactoring, Testing

**Non-Development Tasks (Direct Implementation):** Documentation, Configuration, Research

### TDD Session Management (Development Tasks Only)

Follow [TDD guidelines](../guidelines/testing/test-strategy/tdd-test-driven-development.md) with strict Red-Green-Refactor methodology:

1. **RED Phase** — Write or modify ONLY test code. Tests MUST fail. No implementation code changes. Session ends when tests are written and failing.

2. **GREEN Phase** — Write or modify ONLY implementation code. Write minimal code to make tests pass. No test code changes. Session ends when all tests pass.

3. **REFACTOR Phase** — Improve code structure without changing behavior. Both test and production code may be cleaned up. All tests must remain green. Session ends when refactoring objectives are complete.

**CRITICAL**: NEVER modify both tests and implementation code in the same session.

### Direct Implementation (Non-Development Tasks)

- Implement task requirements directly — no TDD required
- Follow documentation standards, configuration best practices, or research methodology
- Validate against task acceptance criteria

## Implementation Flow

### Phase 0: Story & Task Analysis (BLOCKING PREREQUISITE)

**HALT ALL WORK** if this phase is not successfully completed.

1. **Read complete user story** from PM tool — understand business value and acceptance criteria
2. **Analyze ALL tasks** in the story — validate each follows the task template
3. **Validate story state** — must be "In Progress" and assigned to developer
4. **Confirm task specifications** — all implementation details present

Present analysis to developer and get explicit confirmation before proceeding.

### Phase 1: Setup & Context Loading

1. **Load technical context** — architecture, tech stack, way-of-working from adoption files
2. **Create or switch to feature branch** — per [branch template](../guidelines/collaboration/templates/branch-template.md): `<type>/#<story-id>-<brief-description>`
3. **Choose commit strategy** (for multi-task stories) — per-task commits (recommended, granular) or per-story commit (single commit at end). Single PR per story regardless.

### Phase 2: Task-by-Task Implementation

Process tasks **sequentially**. For each task:

1. **Set active task** — update session state
2. **Validate task completeness** — HALT if task spec is incomplete
3. **Execute implementation** — TDD cycle (RED → GREEN → REFACTOR) for development tasks, direct implementation for non-development tasks
4. **Verify quality** — run quality gates per [quality standards](../guidelines/quality-assurance/quality-standards/README.md). HALT on failure.
5. **Commit** (if per-task strategy) — per [commit template](../guidelines/collaboration/templates/commit-template.md)
6. **Mark task complete** — update story checklist, progress to next task

### Phase 3: Commit, Push & PR

1. **Final commit** (if per-story strategy) — per [commit template](../guidelines/collaboration/templates/commit-template.md)
2. **Push branch** to remote
3. **Create PR** — per [PR template](../guidelines/collaboration/templates/pr-template.md), linking the user story issue
4. **Update story status** to "In Review" in PM tool

## Success Criteria

#### Story Implementation Complete When:

- [ ] Phase 0 completed successfully
- [ ] All tasks marked complete in story checklist
- [ ] All acceptance criteria validated
- [ ] Implementation matches task specifications exactly
- [ ] Quality gates passed per [quality standards](../guidelines/quality-assurance/quality-standards/README.md)
- [ ] Code committed and pushed to feature branch
- [ ] PR created with comprehensive description
- [ ] Story status updated to "In Review"

#### Additional for Development Tasks:

- [ ] All TDD cycles completed (RED → GREEN → REFACTOR)
- [ ] All tests passing with adequate coverage

## Emergency Procedures

- **Story/Task Issues**: Use [08-refine-story](08-how-to-refine-a-user-story.md) or [09-create-tasks](09-how-to-create-tasks.md)
- **Technical Blockers**: HALT, request task updates, consult relevant guidelines
- **Process Issues**: Reset to last stable state, escalate to developer

## References

### Templates

- [Task Template](../guidelines/collaboration/templates/task-template.md) — task specification format
- [Branch Template](../guidelines/collaboration/templates/branch-template.md) — branch naming standards
- [Commit Template](../guidelines/collaboration/templates/commit-template.md) — commit message format
- [PR Template](../guidelines/collaboration/templates/pr-template.md) — pull request structure

### Adoption & Standards

- [Tech Stack](../../adoption/tech/tech-stack.md) — approved libraries and versions
- [Architecture](../../adoption/tech/architecture.md) — system architecture patterns
- [Way of Working](../../adoption/tech/way-of-working.md) — development process

### Guidelines

- [TDD Guidelines](../guidelines/testing/test-strategy/tdd-test-driven-development.md) — test-driven development methodology
- [Unit Testing](../guidelines/testing/unit-testing/README.md) — testing standards
- [Code Design](../guidelines/code-design/README.md) — code design principles
- [Quality Standards](../guidelines/quality-assurance/quality-standards/README.md) — quality gates

### Related Workflows

- [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md) — story refinement
- [09-how-to-create-tasks.md](09-how-to-create-tasks.md) — task creation
- [11-how-to-code-review.md](11-how-to-code-review.md) — code review

## Next Steps

→ [11-how-to-code-review.md](11-how-to-code-review.md)
