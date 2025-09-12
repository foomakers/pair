# How to Implement a Task (from User Stories) - AI-Assisted Guide

## Overview

This guide enables Product Software Engineers and AI assistants to collaboratively implement tasks from user stories, following established technical standards and architectural patterns. Task implementation transforms **specific implementation steps** into working code that delivers story acceptance criteria while maintaining consistency with adopted technical guidelines and architectural decisions.

**Key Benefits:**

- Transform task specifications into working, tested code
- Ensure implementation consistency with established technical standards
- Maintain code quality through systematic TDD development processes
- Enable continuous integration through proper branch management
- Provide clear progress tracking and facilitate code review processes

**Important**: Tasks are implemented following technical guidelines - they represent the execution phase where task specifications become functional code while adhering to established patterns, standards, and architectural decisions.

## AI Assistant Role Definition

**Primary Role**: Product Software Engineer (Implementation)

The AI assistant acts as a **Product Software Engineer** who:

- **Analyzes** sprint status and identifies active or next tasks for implementation
- **Implements** task specifications following established technical guidelines and TDD methodology
- **Applies** adopted technical standards from architecture, infrastructure, tech stack, and UX/UI guidelines
- **References** knowledge base documentation for implementation details
- **Manages** development workflow including branch creation, commits, and progress tracking
- **Maintains** code quality through systematic TDD development processes
- **Reviews** implementation progress collaboratively with development team
- **Ensures** consistency with established technical decisions and ADRs

**Working Principles**: Follow the **🤖🤝👨‍💻** model (AI implements, Developer reviews) throughout the entire task implementation process.

## Issue Access and Tool Integration

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks.**

### Access Protocol

**Step 1: Tool Configuration Check**

1. **Read** [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:
   _"I cannot proceed because no project management tool is configured. Complete bootstrap first: [How to Complete Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/knowledge/guidelines/12-collaboration-and-process-guidelines/project-management-framework.md) for all access procedures
- **Use configured tool** as primary and authoritative source for all issue data

### Filesystem Access Rules

**✅ PERMITTED ONLY when:** Tool in [way-of-working.md](.pair/adoption/tech/way-of-working.md) = "filesystem"
**🚫 PROHIBITED when:** Any other tool is configured

## TDD Implementation Methodology

### Core TDD Principles

**CRITICAL: Test-Driven Development Rules**

- **Red-Green-Refactor Cycle**: All code must follow strict TDD methodology
- **Test First**: ALWAYS write tests before implementation code
- **Failing Tests Required**: Tests must fail initially to validate correct behavior testing
- **Single Session Rule**: NEVER modify both tests and implementation code in the same session
- **Complete Cycle**: Each task requires complete Red-Green-Refactor cycle execution

### TDD Session Management

**Session Types and Restrictions:**

1. **Test Writing Session (RED Phase)**:

   - Write or modify ONLY test code
   - NO implementation code changes allowed
   - Tests MUST fail when first written
   - Session ends when tests are written and failing

2. **Implementation Session (GREEN Phase)**:

   - Write or modify ONLY implementation code
   - NO test code changes allowed
   - Write minimal code to achieve green state
   - Session ends when all tests pass

3. **Refactoring Session (REFACTOR Phase)**:
   - Improve code structure without changing behavior
   - Both tests and code may be refactored for clarity
   - All tests must remain green throughout
   - Session ends when refactoring objectives complete

## Implementation Prerequisites

### Version Consistency and Library Management

**CRITICAL: Version Consistency Rules**

- **Default Rule**: All workspaces MUST use consistent versions of tools and dependencies
- **Compilers and Libraries**: Same compiler version across all workspaces without exception
- **Human Decision Required**: NEVER implement version differences without explicit human approval
- **Documentation Mandatory**: All version exceptions MUST be documented with detailed justification
- **ADR Creation**: Architectural decisions require Architecture Decision Record

**CRITICAL: Library Management Rules**

- **Approved Libraries Only**: ONLY use libraries defined in technical analysis and adoption documents
- **Exact Versions Required**: Use ONLY the specific versions specified in adoption documentation
- **No Arbitrary Additions**: NEVER add new libraries without proper technical analysis
- **Task Analysis Reopening**: Adding new libraries requires reopening technical analysis phase
- **Human Discussion Required**: All library additions must be discussed following `.pair/how-to/09-how-to-create-tasks.md`

## Step-by-Step Implementation Process

### Step 0: Sprint Analysis and Task Identification

**Phase 0A: Current Sprint Status Analysis**

1. **Analyze Git Status**: Check current development state:

   ```bash
   git status
   git branch -a
   git log --oneline -10
   ```

2. **Priority-Based Story Selection**: Identify user stories ready for implementation following this priority order:

   - **Primary Target**: User stories in "In Progress" state with highest priority (P0 > P1 > P2) assigned to me
   - **Secondary Check**: If no "In Progress" stories assigned to me, check for "Refined" stories that need task breakdown first
   - **Tertiary Check**: If stories are in "Todo" state, they need refinement before implementation

3. **Identify Project Management Tool**: Reference `.pair/adoption/tech/way-of-working.md` to determine current project management system and access procedures.

**Phase 0B: Work Continuation or New Task Selection**

4. **Check for Active Work**: Determine current development status and either continue active work or select next story based on state priority:

   - **Active "In Progress" Stories**: Continue work on highest priority assigned story
   - **Available "Refined" Stories**: Need task breakdown before implementation
   - **"Todo" Stories**: Need refinement process before task breakdown

5. **Sprint Story Analysis**: Review current sprint stories and propose next story for implementation based on state, priority, assignment, and readiness.

### Step 1: Story Selection and Workflow Setup

**AI Assistant Instructions:** Handle story selection and workflow initialization:

1. **Finalize Story Selection**: Confirm story choice with developer and proceed with workflow setup.

   **User Confirmation Required**: _"I've identified [Story/Task identification details]. Should I proceed with implementing this [story/task]?"_

2. **MANDATORY PRE-IMPLEMENTATION VALIDATION**: Following collaboration guidelines from `.pair/knowledge/12-collaboration-and-process-guidelines/project-management-framework.md`:

   **⚠️ CRITICAL: PROCESS BLOCKER - Implementation CANNOT proceed until ALL conditions are met:**

   - **User story MUST be in 'In Progress' state** (prerequisite for technical development)
   - **User story MUST be assigned to me** (developer implementing the tasks)
   - **Tasks MUST be defined** and documented within the user story
   - **Epic status updated** to In Progress if necessary
   - **Branch MUST be associated with the user story** if supported by the project management tool

   **If story is in WRONG state:**

   - **If story is in 'Todo' state**: **HALT** - Story needs refinement first using [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md)
   - **If story is in 'Refined' state**: **HALT** - Story needs task breakdown first using [09-how-to-create-tasks.md](09-how-to-create-tasks.md)
   - **If story is in 'Done' state**: **HALT** - Story is completed, select different story

   **If ANY of these conditions are NOT met:**

   - **HALT ALL IMPLEMENTATION ACTIVITIES**
   - **DO NOT create branches**
   - **DO NOT write any code**
   - **DO NOT proceed to Step 2**

   **Required Action:** Request the developer to complete the missing requirements according to the collaboration guidelines, then verify completion before proceeding.

**If the project management tool doesn't support story assignment or branch association operations, request the developer to perform them manually according to the collaboration guidelines.**

**Status Update Confirmation:**
"✅ VALIDATION COMPLETE: Story '[STORY_ID]: [STORY_NAME]' is in 'In Progress' state, assigned to me, with tasks defined. Parent Epic '[EPIC_ID]' status updated accordingly. Branch will be associated with the story. All pre-implementation requirements met. Proceeding with development workflow setup."

### Step 2: Branch Creation and Development Setup

1. **Verify Git Environment**: Confirm clean staging and main branch status.

2. **Apply Branch Naming Convention**: Create branch following established pattern:

   - MUST include reference to user story as `#` + story code (e.g. `#231`)
   - Follow naming pattern from way-of-working
   - Use descriptive but concise name

3. **Execute Branch Creation**: Create and switch to branch with upstream tracking.

### Step 3: Implementation Strategy Selection

1. **Confirm TDD Approach**: Ask developer whether to follow TDD methodology for each task:

   - For documentation tasks, TDD is **not required** by default
   - For other tasks, propose TDD based on task nature
   - Offer **Task-by-Task TDD Cycles** or **Feature-Complete TDD Implementation** options

2. **Configure TDD Progress Tracking**: Set up appropriate tracking based on selected approach.

### Step 4: TDD Task Implementation Execution

**AI Assistant Instructions:** Execute TDD implementation following strict methodology:

1. **Load Technical Context**: Review all foundation documentation, knowledge base guidelines, and domain context before implementation.

2. **Execute TDD Cycles**: For each task, follow strict TDD phases:

   - **RED Session**: Write ONLY failing tests for task requirements
   - **GREEN Session**: Write ONLY implementation code to pass tests
   - **REFACTOR Session**: Improve ONLY code structure while keeping tests green

3. **Version Consistency Validation**: Verify all dependencies use consistent versions, ensure only approved libraries are used, and request human approval for any changes.

4. **TDD Progress Tracking**: Maintain progress indicators based on selected approach (task-by-task or feature-complete).

### Step 5: TDD Implementation Review and Completion

Handle review process based on selected TDD approach:

**Task-by-Task Review**: After each complete RED-GREEN-REFACTOR cycle, provide comprehensive TDD cycle completion notification, update task checklist in user story, and handle feedback.

**Feature-Complete Review**: After all tasks complete TDD cycles, provide complete story TDD implementation summary, update all task checklists in user story, and handle comprehensive review.

### Step 6: Implementation Documentation and Handoff

1. **Create TDD Implementation Summary**: Document TDD-compliant work with technical implementation record.

2. **Update Project Management System**: Ensure accurate TDD status tracking with story completion status and epic progress updates.

3. **Prepare for Code Review**: Set up next phase with TDD validation, ensuring branch contains complete TDD commit history and implementation completeness validation.

### Step 7: Task Completion Tracking

**AI Assistant Instructions:** Update task progress in user story upon task completion and approval:

1. **Identify Completed Task**: Determine which specific task has been completed and approved
2. **Read Current User Story**: Retrieve the current user story body including the task breakdown section
3. **Update Task Checklist**: Mark the completed task as checked without modifying any other content
4. **Update Progress Counter**: Update the task progress counter
5. **Preserve All Other Content**: Ensure no refinement details, acceptance criteria, or other story content is overwritten

**Reference**: Follow the [Task Template](.pair/knowledge/guidelines/12-collaboration-and-process-guidelines/assets/task-template.md) format for proper task completion tracking and documentation.

**Task Completion Validation:**
_"✅ TASK COMPLETED: Task '[TASK-ID]: [TASK_TITLE]' has been marked as completed in User Story '[STORY_ID]: [STORY_NAME]'. Task progress updated. User story remains in 'In Progress' state until all tasks are completed."_

**When All Tasks Complete:**
_"🎉 ALL TASKS COMPLETED: All tasks for User Story '[STORY_ID]: [STORY_NAME]' have been completed. The story is ready for final review and potential status update to 'Done' following the code review process."_

## Quality Assurance Framework

### TDD Quality Standards

- [ ] **RED Phase Compliance**: All tests written before implementation code
- [ ] **GREEN Phase Compliance**: Minimal implementation written to pass tests only
- [ ] **REFACTOR Phase Compliance**: Code improvements made without behavior changes
- [ ] **Session Separation**: No mixed test/implementation modifications in same session
- [ ] **Complete Cycles**: All tasks completed full RED-GREEN-REFACTOR cycles
- [ ] **Test Coverage**: Comprehensive test coverage for all acceptance criteria

### Implementation Quality Requirements

- [ ] **Standard Compliance**: All code follows established conventions
- [ ] **Architecture Alignment**: Implementation follows adopted patterns
- [ ] **Technology Standards**: Uses approved technologies with exact versions
- [ ] **Version Consistency**: All dependencies use consistent versions across workspaces
- [ ] **Documentation**: Code includes appropriate documentation and comments
- [ ] **Security**: Follows established security standards

### Implementation Completeness

- [ ] **Task Specifications**: All requirements implemented exactly as specified
- [ ] **Acceptance Criteria**: All story acceptance criteria addressed
- [ ] **Technical References**: Implementation follows referenced patterns
- [ ] **Integration Points**: External dependencies properly integrated
- [ ] **Error Handling**: Appropriate error handling implemented
- [ ] **User Experience**: UI/UX follows established patterns

### Process Compliance

- [ ] **Branch Management**: Development branch properly created with standard naming and story association
- [ ] **Commit Standards**: All commits follow established message formatting with TDD phases
- [ ] **Progress Tracking**: Task and story status accurately maintained with TDD indicators
- [ ] **Task Checklist Updates**: Task completion tracked in user story without overwriting refined content
- [ ] **Review Process**: Appropriate review checkpoints completed for TDD cycles
- [ ] **Status Updates**: Project management system properly updated according to collaboration guidelines
- [ ] **Documentation Updates**: Any new patterns or decisions properly documented
- [ ] **Epic Management**: Parent epic status properly maintained
- [ ] **Handoff Preparation**: Implementation ready for code review with TDD documentation

## Best Practices

### TDD-Specific Do's:

- **Always follow strict TDD methodology** with complete RED-GREEN-REFACTOR cycles
- **Write tests first in dedicated sessions** without any implementation code modifications
- **Implement minimal code in separate sessions** focused solely on making tests pass
- **Never modify tests and implementation together** - maintain strict session separation
- **Validate test failures are meaningful** before proceeding to implementation
- **Commit each TDD phase separately** with clear phase identification

### General Do's:

- **Always analyze sprint status first** to identify active work or priorities
- **Verify git environment cleanliness** before starting work
- **Follow established naming conventions** for branches and commits
- **Reference complete technical context** including architecture and standards
- **Maintain version consistency** across all workspaces
- **Request human approval** for any version changes or architectural decisions
- **Provide clear progress tracking** with regular status updates
- **Update task checklist in user story** upon task completion without overwriting other content

### TDD-Specific Don'ts:

- **Never write implementation before tests** - always start with RED phase
- **Don't modify tests and code together** - maintain strict session separation
- **Never skip test failure validation** - ensure tests fail for correct reasons
- **Don't over-engineer in GREEN phase** - write minimal code to pass tests
- **Never change behavior during REFACTOR** - improve structure only
- **Don't commit mixed changes** - each commit should represent single TDD phase

### General Don'ts:

- **Never start implementation** without analyzing current sprint status
- **Don't create branches** with uncommitted changes or when not on main
- **Never implement version differences** without explicit human approval
- **Don't deviate from task specifications** without documented justification
- **Never skip testing requirements** established in testing strategy
- **Don't ignore architectural patterns** established in documentation
- **Never commit work** without following established standards
- **Don't update project status** without following collaboration guidelines

## Common Pitfalls and Solutions

| Pitfall                                       | Impact                               | Solution                                                  |
| --------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| **Writing tests and implementation together** | Violates TDD methodology             | Maintain strict session separation                        |
| **Adding unapproved libraries**               | Breaks architectural consistency     | Use only libraries from adoption documentation            |
| **Skipping test failure validation**          | Tests may not test intended behavior | Always validate meaningful failures before implementation |
| **Over-engineering in GREEN phase**           | Adds unnecessary complexity          | Write minimal code to pass tests                          |
| **Mixed TDD phase commits**                   | Obscures TDD process                 | Each commit should represent single TDD phase             |
| **Skipping sprint analysis**                  | Working on wrong priorities          | Always analyze current sprint and git status first        |
| **Version inconsistency introduction**        | Breaking builds and deployments      | Validate consistency and request approval for changes     |
| **Improper story/branch association**         | Lost traceability                    | Follow collaboration guidelines for proper association    |

## References

**Essential Files:**

- [Product vision and requirements](.pair/adoption/product/PRD.md)
- [Development methodology](.pair)
- [System architecture patterns](.pair/adoption/tech/architecture.md)
- [Technology standards](.pair/adoption/tech/tech-stack.md)
- [User interface guidelines](.pair/adoption/tech/ux-ui.md)
- [Project Management Tool Guidelines](.pair/knowledge/guidelines/12-collaboration-and-process-guidelines/project-management-framework.md)

**Knowledge Base (Complete Technical Guidelines):**

- **[01-architectural-guidelines.md](.pair/knowledge/guidelines/01-architectural-guidelines.md))** - Architecture patterns and ADR processes
- **[02-code-design-guidelines.md](.pair/knowledge/guidelines/02-code-design-guidelines.md)** - Code organization and design patterns
- **[07-testing-strategy.md](.pair/knowledge/guidelines/07-testing-strategy.md)** - Testing frameworks and TDD strategies
- **[06-definition-of-done.md](.pair/knowledge/guidelines/06-definition-of-done.md)** - Quality criteria and completion standards

**Process Dependencies:**

- **Prerequisites**: Tasks from refined user story ready for implementation
- **Input**: Task specifications serve as implementation requirements
- **Output**: Working code with comprehensive test coverage ready for code review
- **TDD Methodology**: All implementation must follow strict Test-Driven Development
- **Next Phase**: TDD-compliant code ready for code review process

**Related Documents:**

- Previous: [09-how-to-create-tasks.md](09-how-to-create-tasks.md)
- Bootstrap: [02-how-to-complete-bootstrap-checklist.md](02-how-to-complete-bootstrap-checklist.md)
- Next: [11-how-to-commit-and-push](11-how-to-commit-and-push.md)

This guide ensures systematic, high-quality task implementation following established technical standards and strict Test-Driven Development methodology while maintaining development workflow consistency and preparing code for effective review processes.
