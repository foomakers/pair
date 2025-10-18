# How to Implement a Task - AI-Assisted Guide

## Overview

Transform task specifications into working, tested code by implementing **exactly what is defined** in task breakdown without additions or modifications.

**Role**: Product Software Engineer (Implementation)
**Process**: 🤖🤝👨‍💻 (AI implements, Developer reviews)

**CRITICAL FIRST STEP**: Before any implementation work begins, complete Phase 0: Story & Task Analysis to fully understand what needs to be implemented.

## Session State Management

**CRITICAL**: Maintain this context throughout implementation:

```
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

- **Implement ONLY** what is specified in the active task you find in the PM tool according to the [task template](../guidelines/collaboration/templates/task-template.md)
- **No arbitrary additions** - if something seems missing, request task updates
- **Follow task specifications** for libraries, files, and implementation approach
- **Use ONLY specified libraries** - never add libraries not listed in task implementation approach
- **Validate against task acceptance criteria** before considering complete

**CRITICAL**: If task seems incomplete or requires additional libraries/changes:

- **HALT implementation immediately**
- **Propose specific task updates** to developer
- **Suggest alternative approaches** based on [tech-stack.md](../adoption/tech/tech-stack.md)
- **Do NOT proceed** until task is updated and complete

### Technical Alignment Requirements

- **Architecture**: Follow patterns defined in [adopted architecture](../adoption/tech/architecture.md)
- **Technology Stack**: Use ONLY libraries/versions from [tech-stack.md](../adoption/tech/tech-stack.md)
- **Development Process**: Follow workflows from [way-of-working.md](../adoption/tech/way-of-working.md)
- **Code Design**: Apply principles from [code design guidelines](../guidelines/code-design/README.md)
- **Testing**: Follow [test strategy](../guidelines/testing/test-strategy/README.md) for TDD implementation

## Prerequisites & Guardrails

### 🚫 Critical Blockers

- **Clean Git**: No uncommitted changes, on main branch
- **PM Tool Configured**: Must exist in [way-of-working.md](../adoption/tech/way-of-working.md)
- **Story Analysis Complete**: Phase 0 must be completed before any other work

### 📋 Access Requirements

Follow [project management tool guidelines](../guidelines/collaboration/project-management-tool/README.md) for tool-specific access procedures based on the configured tool in [way-of-working.md](../adoption/tech/way-of-working.md).

**Access Rules:**

- **✅ PERMITTED**: Filesystem access ONLY when tool = "filesystem" in way-of-working.md
- **🚫 PROHIBITED**: Filesystem access when any other tool is configured

**IMPORTANT**: Before proceeding to any implementation phases, **Phase 0: Story & Task Analysis** must be completed successfully. This includes reading the complete user story, understanding all tasks, and confirming implementation readiness.

## Implementation Methodology

### Task Type Classification

Based on [task template](../guidelines/collaboration/templates/task-template.md), determine implementation approach:

**Development Tasks (TDD Required):**

- **Feature Implementation** - New functionality development
- **Bug Fix** - Correcting identified issues or defects
- **Refactoring** - Code improvement without behavior changes
- **Testing** - Test creation, execution, or automation

**Non-Development Tasks (Direct Implementation):**

- **Documentation** - Creating or updating documentation
- **Configuration** - Setup, deployment, or environment tasks
- **Research** - Investigation, spike, or proof of concept

### TDD Implementation Methodology (Development Tasks Only)

**CRITICAL: Test-Driven Development Rules**

Follow [TDD guidelines](../guidelines/testing/test-strategy/tdd-test-driven-development.md) with strict methodology:

- **Red-Green-Refactor Cycle**: All development code must follow strict TDD methodology
- **Test First**: ALWAYS write tests before implementation code
- **Failing Tests Required**: Tests must fail initially to validate correct behavior testing
- **Single Session Rule**: NEVER modify both tests and implementation code in the same session
- **Complete Cycle**: Each development task requires complete Red-Green-Refactor cycle execution

### TDD Session Management

**Session Types and Restrictions (Development Tasks Only):**

1. **Test Writing Session (RED Phase)**:

   - Write or modify ONLY test code following [unit testing guidelines](../guidelines/testing/unit-testing/README.md)
   - NO implementation code changes allowed
   - Tests MUST fail when first written
   - Session ends when tests are written and failing

2. **Implementation Session (GREEN Phase)**:

   - Write or modify ONLY implementation code following [code design principles](../guidelines/code-design/design-principles/README.md)
   - NO test code changes allowed
   - Write minimal code to achieve green state
   - Session ends when all tests pass

3. **Refactoring Session (REFACTOR Phase)**:
   - Improve code structure without changing behavior
   - Both tests and code may be refactored for clarity
   - All tests must remain green throughout
   - Session ends when refactoring objectives complete

### Direct Implementation (Non-Development Tasks)

**For Documentation, Configuration, and Research tasks:**

- **No TDD Required**: These tasks don't require test-driven development
- **Direct Implementation**: Implement task requirements directly
- **Quality Focus**: Follow documentation standards, configuration best practices, or research methodology
- **Validation**: Verify against task acceptance criteria without formal testing

## Implementation Flow

### Phase 0: Story & Task Analysis (BLOCKING PREREQUISITE)

**🚫 CRITICAL: NO IMPLEMENTATION WITHOUT COMPLETE STORY & TASK UNDERSTANDING**

```
1. Read Complete User Story → Load from PM tool, understand business value
2. Analyze All Story Tasks → Validate task breakdown completeness
3. Validate Story State → Must be "In Progress" and assigned to me
4. Confirm Task Specifications → Ensure all implementation details present
```

**Story Reading Requirements:**

- **Load story from configured PM tool** per [way-of-working.md](../adoption/tech/way-of-working.md)
- **Understand business value and acceptance criteria** completely
- **Verify story status**: Must be "In Progress" and assigned to developer
- **Confirm epic context**: Understand how story fits in larger initiative

**Task Analysis Requirements:**

- **Read ALL tasks in the story** - never implement partial understanding
- **Validate each task follows [task template](../guidelines/collaboration/templates/task-template.md)**:
  - Complete task information (ID, parent story, assignee, priority, status)
  - Detailed implementation approach (technical design, files, dependencies)
  - Acceptance criteria (deliverable, quality standards, verification)
  - Development workflow (TDD approach, implementation steps, testing)

**BLOCKING VALIDATION:**
If ANY of these conditions are not met, **HALT ALL WORK**:

- [ ] Story not fully loaded and understood
- [ ] Tasks incomplete or missing implementation details
- [ ] Story not in "In Progress" state
- [ ] Story not assigned to implementing developer
- [ ] Task specifications don't follow template requirements
- [ ] Unclear libraries to use or implementation approach

**Developer Confirmation Required:**
_"I've analyzed Story [STORY-ID]: [TITLE] with [X] tasks. All task specifications are complete and follow the template. Story is in 'In Progress' state and assigned to me. I understand the business value and technical requirements. Ready to proceed with implementation?"_

### Phase 1: Setup & Context Loading

```
1. Validate Prerequisites → Check blockers and story state
2. Load Technical Context → Architecture, tech stack, existing patterns
3. Create Feature Branch → Standard naming with story reference
4. Choose Commit Strategy → Per-task or per-story completion
```

**Branch Requirements:**
Follow [branch template](../guidelines/collaboration/templates/branch-template.md) with pattern:

```
<type>/#<story-id>-<brief-description>
```

**Examples:**

- `feature/#US-123-user-authentication`
- `bug/#BUG-456-login-validation-error`
- `docs/#DOC-789-api-documentation`

**Branch Creation:**

```bash
# Ensure clean main branch
git checkout main
git pull origin main

# Create feature branch with story reference
git checkout -b feature/#US-123-user-authentication

# Set upstream tracking
git push -u origin feature/#US-123-user-authentication
```

**Association**: Link branch to story in PM tool

### Phase 2: Task-by-Task Implementation

```
For each task in story:
  1. Update Session State → Set active task and implementation mode
  2. Validate Task Completeness → Ensure all required info present
  3. Execute Implementation → TDD cycle OR Direct implementation
  4. Update Task Status → Mark complete in PM tool
  5. Commit Changes → Based on chosen strategy
  6. Progress to Next → Update state for next task
```

**Task Validation Requirements:**
Based on [task template](../guidelines/collaboration/templates/task-template.md), each task must have:

- Complete task information (ID, parent story, assignee, priority, status)
- Detailed implementation approach (technical design, files to modify/create, dependencies)
- Acceptance criteria (primary deliverable, quality standards, verification methods)
- Development workflow (TDD approach, implementation steps, testing strategy)

**Implementation Rules by Task Type:**

**Development Tasks (TDD Mode):**

- **RED**: Write failing tests only, apply [unit testing guidelines](../guidelines/testing/unit-testing/README.md)
- **GREEN**: Write minimal implementation only, follow [code design principles](../guidelines/code-design/design-principles/README.md)
- **REFACTOR**: Improve structure only, keep tests green

**Non-Development Tasks (Direct Mode):**

- **Documentation**: Follow [documentation standards](../guidelines/user-experience/markdown-templates.md)
- **Configuration**: Apply [infrastructure guidelines](../guidelines/infrastructure/README.md)
- **Research**: Document findings and recommendations

**Task Status Updates:**

- Mark completed task as ✅ in story checklist
- Update progress counter (e.g., "Tasks: 3/5 completed")
- Preserve all story content (acceptance criteria, etc.)

### Phase 3: Commit & Push Workflow

**Strategy Selection (Choose Once Per Story):**

**Option A: Per-Task Commits**

```
After each task completion:
1. Stage changes → git add .
2. Commit with task reference → Follow commit standards
3. Push to remote → Enable backup and collaboration
```

**Option B: Per-Story Commits**

```
After all tasks complete:
1. Stage all changes → git add .
2. Commit with story summary → Reference all completed tasks
3. Push final implementation → Ready for PR creation
```

**Commit Message Format:**
Follow [commit template](../guidelines/collaboration/templates/commit-template.md):

**For Development Tasks (TDD):**

```
[US-XXX] [type]: [task-description]

- Implement [specific functionality]
- TDD: [RED|GREEN|REFACTOR] phase
- Task: [TASK-ID] - [task title]

Refs: #story-id
```

**For Non-Development Tasks:**

```
[US-XXX] docs: [task-description]
# or
[US-XXX] config: [task-description]
# or
[US-XXX] chore: [task-description]

- [Description of changes]
- Task: [TASK-ID] - [task title]

Refs: #story-id
```

### Phase 4: Quality Validation & Handoff

```
1. Run Quality Checks → Tests, lints, security scans
2. Validate Implementation → All acceptance criteria met
3. Update Story Status → Ready for review
4. Prepare for PR Creation → Branch ready for pull request
```

**Quality Gates:**
Apply [quality standards](../guidelines/quality-assurance/quality-standards/README.md):

**For Development Tasks:**

- [ ] All tests passing (TDD cycles complete)
- [ ] All tasks marked complete in story
- [ ] All acceptance criteria addressed
- [ ] Code follows [code design guidelines](../guidelines/code-design/README.md)
- [ ] Only approved libraries from [tech-stack.md](../adoption/tech/tech-stack.md) used
- [ ] Version consistency maintained per [architecture decisions](../adoption/tech/architecture.md)

**For Non-Development Tasks:**

- [ ] All tasks marked complete in story
- [ ] All acceptance criteria addressed
- [ ] Documentation follows [markdown standards](../guidelines/user-experience/markdown-templates.md)
- [ ] Configuration follows [infrastructure guidelines](../guidelines/infrastructure/README.md)
- [ ] Research findings properly documented and recommendations clear

### Phase 5: Pull Request Creation & Review Setup

```
1. Generate PR Description → Using PR template with complete context
2. Assign Reviewers → Based on code expertise and team patterns
3. Create Pull Request → With proper title, description, and metadata
4. Update Project Status → Mark story as "In Review"
5. Setup Review Communication → Notify reviewers and establish channels
```

**PR Creation Requirements:**
Follow [PR template](../guidelines/collaboration/templates/pr-template.md) structure:

**PR Title Format:**

```
[US-XXX] [type]: [brief description of changes]
```

**PR Description Structure:**

- **Summary**: What changed and why
- **Story Context**: User story reference and acceptance criteria coverage
- **Changes Made**: Implementation details and files affected
- **Testing**: Test coverage and validation steps
- **Quality Assurance**: Code quality checklist and review areas
- **Deployment Information**: Environment impact and deployment notes

**Reviewer Assignment Strategy:**

- **Code Area Experts**: Assign reviewers with expertise in affected components
- **Team Rotation**: Follow team patterns for knowledge distribution
- **Required Reviewers**: Include mandatory reviewers per team policy
- **Knowledge Sharing**: Balance expertise with learning opportunities

**Project Status Update:**

- Update story status from "Implementation Complete" to "In Review"
- Add PR reference to all related tasks in PM tool
- Update epic progress to reflect code review phase
- Maintain traceability: Story → Tasks → Commits → PR

## Key References

**Technical Constraints:**

- **Libraries**: Only approved from [tech-stack.md](../adoption/tech/tech-stack.md) or task-specified
- **Architecture**: Follow [architecture decisions](../adoption/tech/architecture.md) and [guidelines](../guidelines/architecture/README.md)
- **Quality**: Apply [code design](../guidelines/code-design/README.md), [security](../guidelines/quality-assurance/security/README.md), and [quality standards](../guidelines/quality-assurance/quality-standards/README.md)

**Emergency Procedures:**

- **Story Issues**: Use [08-refine-story](./08-how-to-refine-a-user-story.md) or [09-create-tasks](./09-how-to-create-tasks.md)
- **Technical Blockers**: Halt implementation, request task updates, consult relevant guidelines
- **Process Issues**: Reset to last stable state, escalate to developer

## Success Criteria

**Story Implementation Complete When:**

- [ ] Phase 0: Story & Task Analysis completed successfully
- [ ] All tasks marked ✅ in story checklist
- [ ] All acceptance criteria validated
- [ ] Implementation matches task specifications exactly
- [ ] Code committed and pushed to feature branch
- [ ] Quality gates passed per [quality standards](../guidelines/quality-assurance/quality-standards/README.md)
- [ ] Pull request created with comprehensive description using [PR template](../guidelines/collaboration/templates/pr-template.md)
- [ ] Reviewers assigned based on expertise and team patterns
- [ ] Story status updated to "In Review" in PM tool
- [ ] Ready for code review process

**Additional for Development Tasks:**

- [ ] All TDD cycles completed (RED-GREEN-REFACTOR)
- [ ] All tests passing with adequate coverage

**Additional for Non-Development Tasks:**

- [ ] Documentation meets [markdown standards](../guidelines/user-experience/markdown-templates.md)
- [ ] Configuration follows [infrastructure guidelines](../guidelines/infrastructure/README.md)
- [ ] Research findings properly documented

## References

### Templates & Guidelines

- [Task Template](../guidelines/collaboration/templates/task-template.md) - Complete task specification format
- [Branch Template](../guidelines/collaboration/templates/branch-template.md) - Branch naming standards
- [Commit Template](../guidelines/collaboration/templates/commit-template.md) - Commit message format
- [PR Template](../guidelines/collaboration/templates/pr-template.md) - Pull request structure

### Technical Standards

- [Tech Stack](../adoption/tech/tech-stack.md) - Approved libraries and versions
- [Architecture Decisions](../adoption/tech/architecture.md) - System architecture patterns
- [Way of Working](../adoption/tech/way-of-working.md) - Development process configuration

### Development Guidelines

- [TDD Guidelines](../guidelines/testing/test-strategy/tdd-test-driven-development.md) - Test-driven development methodology
- [Unit Testing](../guidelines/testing/unit-testing/README.md) - Testing standards and practices
- [Code Design](../guidelines/code-design/README.md) - Code design principles and patterns
- [Quality Standards](../guidelines/quality-assurance/quality-standards/README.md) - Quality gates and criteria

### Process Guidelines

- [Project Management Framework](../guidelines/collaboration/project-management-tool/README.md) - PM tool usage
- [Security Guidelines](../guidelines/quality-assurance/security/README.md) - Security requirements
- [Infrastructure Guidelines](../guidelines/infrastructure/README.md) - Configuration standards
- [Documentation Standards](../guidelines/user-experience/markdown-templates.md) - Markdown formatting

### Related Workflows

- [08-how-to-refine-a-user-story.md](./08-how-to-refine-a-user-story.md) - Story refinement process
- [09-how-to-create-tasks.md](./09-how-to-create-tasks.md) - Task creation workflow
- [13-how-to-code-review.md](./13-how-to-code-review.md) - Code review process

## Next Steps

→ [13-how-to-code-review.md](./13-how-to-code-review.md)
