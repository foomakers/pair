# How to Implement a Task (from User Stories) - AI-Assisted Guide

## Overview

This guide enables Product Software Engineers and AI assistants to collaboratively implement tasks from user stories, following established technical standards and architectural patterns. Task implementation transforms **specific implementation steps** into working code that delivers story acceptance criteria while maintaining consistency with adopted technical guidelines and architectural decisions.

**Key Benefits of Task Implementation:**

- Transform task specifications into working, tested code
- Ensure implementation consistency with established technical standards
- Maintain code quality through systematic development processes
- Enable continuous integration through proper branch management
- Provide clear progress tracking through task completion
- Facilitate code review and quality assurance processes

**Important: Tasks are implemented following technical guidelines** - they represent the execution phase where task specifications become functional code while adhering to established patterns, standards, and architectural decisions.

## AI Assistant Role Definition

**Primary Role**: Product Software Engineer (Implementation)

The AI assistant acts as a **Product Software Engineer** who:

- **Analyzes** sprint status and identifies active or next tasks for implementation
- **Implements** task specifications following established technical guidelines and patterns
- **Applies** adopted technical standards from architecture, infrastructure, tech stack, and UX/UI guidelines
- **References** knowledge base documentation for implementation details
- **Manages** development workflow including branch creation, commits, and progress tracking
- **Maintains** code quality through systematic development processes
- **Reviews** implementation progress collaboratively with development team
- **Ensures** consistency with established technical decisions and ADRs

**Working Principles**: Follow the **🤖🤝👨‍💻** model (AI implements, Developer reviews) throughout the entire task implementation process.

## Task Implementation Definition

### What is Task Implementation?

A **Task Implementation** is the **execution phase** where:

- **Transforms Specifications**: Converts task specifications into working code
- **Follows Technical Standards**: Adheres to adopted architecture, tech stack, and implementation patterns
- **Maintains Code Quality**: Implements following established coding standards and conventions
- **Enables Progress Tracking**: Provides clear completion markers and commit history
- **Maintains Version Consistency**: Uses consistent tool and dependency versions across workspaces
- **References Guidelines**: Follows specific documentation for implementation details
- **Ensures Testing Coverage**: Implements required testing according to testing strategy

**Task implementation is systematic and standardized** - it follows established development workflows while maintaining consistency with technical guidelines and architectural decisions.

### Implementation vs Other Development Phases

| Phase                   | Scope                   | Purpose                                       | Detail Level                |
| ----------------------- | ----------------------- | --------------------------------------------- | --------------------------- |
| **Story Creation**      | Feature definition      | Define user value and acceptance criteria     | Functional requirements     |
| **Task Creation**       | Implementation planning | Break down features into executable steps     | Technical specification     |
| **Task Implementation** | Code development        | Transform specifications into working code    | Code and tests              |
| **Code Review**         | Quality assurance       | Validate implementation quality and standards | Code quality and compliance |

## TDD Implementation Methodology

### Core TDD Principles for AI Assistants

**CRITICAL: Test-Driven Development Rules**

- **Red-Green-Refactor Cycle**: All code must be written following strict TDD methodology
- **Test First**: ALWAYS write tests before implementation code
- **Failing Tests Required**: Tests must fail initially to validate they're testing the right behavior
- **Single Session Rule**: NEVER modify both tests and implementation code in the same session
- **Complete Cycle**: Each feature requires complete Red-Green-Refactor cycle execution

### TDD Session Management

**Session Types and Restrictions:**

1. **Test Writing Session (RED Phase)**:

   - Write or modify ONLY test code
   - NO implementation code changes allowed
   - Tests MUST fail when first written
   - Validate test failure messages are meaningful
   - Session ends when tests are written and failing

2. **Implementation Session (GREEN Phase)**:

   - Write or modify ONLY implementation code
   - NO test code changes allowed
   - Focus solely on making failing tests pass
   - Write minimal code to achieve green state
   - Session ends when all tests pass

3. **Refactoring Session (REFACTOR Phase)**:
   - Improve code structure without changing behavior
   - NO new functionality or test additions
   - Both tests and code may be refactored for clarity
   - All tests must remain green throughout
   - Session ends when refactoring objectives complete

**Session Transition Protocol:**

```
RED Session → Commit failing tests → GREEN Session → Commit passing implementation → REFACTOR Session (optional) → Commit improved code → Next RED Session
```

### TDD Implementation Process

**AI Assistant Instructions for TDD:** Each task implementation must follow TDD phases:

**Phase 1: RED - Test Writing Session**

1. **Analyze Task Requirements**: Extract testable behaviors from task specification

   - Identify input/output specifications
   - Extract edge cases and error conditions
   - Define acceptance criteria in testable terms
   - Plan test scenarios covering all requirements

2. **Write Failing Tests ONLY**: Create comprehensive test coverage

   ```
   ✅ Tests written for core functionality
   ✅ Tests written for edge cases
   ✅ Tests written for error conditions
   ✅ All tests failing with meaningful messages
   🚫 NO implementation code written
   ```

3. **Validate Test Failures**: Ensure tests fail for correct reasons

   - Run test suite to confirm failures
   - Verify failure messages are clear and specific
   - Ensure tests are testing intended behavior
   - Document expected vs actual behavior gaps``

**Phase 2: GREEN - Implementation Session**

5. **Implement Minimal Code ONLY**: Write just enough code to pass tests

   ```
   ✅ Implementation code written to pass tests
   ✅ Minimal approach - no over-engineering
   ✅ All tests now passing
   ✅ No additional features beyond test requirements
   🚫 NO test modifications allowed
   ```

6. **Validate Green State**: Ensure all tests pass

   - Run complete test suite
   - Verify no tests are broken
   - Confirm implementation meets test requirements
   - Validate no unintended side effects

7. **Session Completion**: Commit passing implementation

   ```bash
   git add [implementation files only]
   git commit -m "[STORY_CODE]: Implement [Task-ID] to pass tests - GREEN phase

   Implementation includes:
   - [Core functionality implementation]
   - [Edge case handling]
   - [Error condition management]

   All tests now passing - ready for refactoring"
   ```

**Phase 3: REFACTOR - Code Improvement Session (Optional)**

7. **Improve Code Structure**: Enhance without changing behavior

   ```
   ✅ Code structure improved for clarity
   ✅ Test structure improved for maintainability
   ✅ All tests remain passing
   ✅ No behavior changes introduced
   ✅ Better adherence to coding standards
   ```

8. **Session Completion**: Commit refactored code

   ```bash
   git add [all improved files]
   git commit -m "[STORY_CODE]: Refactor [Task-ID] implementation - REFACTOR phase

   Improvements:
   - [Code structure improvements]
   - [Test clarity improvements]
   - [Standard compliance enhancements]

   All tests passing - task implementation complete"
   ```

### TDD Quality Gates

**Session Validation Requirements:**

**RED Phase Quality Gates:**

- [ ] Tests written cover all task requirements
- [ ] Tests fail with clear, meaningful messages
- [ ] No implementation code exists for tested functionality
- [ ] Test scenarios include happy path, edge cases, and errors
- [ ] Tests are independent and can run in any order

**GREEN Phase Quality Gates:**

- [ ] All previously failing tests now pass
- [ ] Implementation is minimal and focused
- [ ] No existing tests broken by new implementation
- [ ] No test code modified during implementation
- [ ] Code meets acceptance criteria exactly

**REFACTOR Phase Quality Gates:**

- [ ] All tests remain passing throughout refactoring
- [ ] Code structure improved without behavior changes
- [ ] Better adherence to coding standards and patterns
- [ ] Improved readability and maintainability
- [ ] No new functionality added during refactoring

## Implementation Prerequisites

### Version Consistency and Library Management Requirements

**CRITICAL: Version Consistency Rules**

- **Default Rule**: All workspaces MUST use consistent versions of tools and dependencies
- **Compilers and Libraries**: Same compiler version across all workspaces without exception
- **Important Reasons Only**: Version differences allowed ONLY for critical technical reasons
- **Human Decision Required**: NEVER implement version differences without explicit human approval
- **Documentation Mandatory**: All version exceptions MUST be documented with detailed justification
- **ADR Creation**: Architectural decisions (including new services) require Architecture Decision Record

**CRITICAL: Library Management Rules**

- **Approved Libraries Only**: ONLY use libraries defined in technical analysis and adoption documents
- **Exact Versions Required**: Use ONLY the specific versions specified in adoption documentation
- **No Arbitrary Additions**: NEVER add new libraries without proper technical analysis
- **Task Analysis Reopening**: Adding new libraries requires reopening technical analysis phase
- **Human Discussion Required**: All library additions must be discussed following `.pair/how-to/09-how-to-create-tasks.md`
- **Adoption Documentation**: New approved libraries must be documented in adoption guidelines

**Version and Library Management Process:**

1. **Check Current Versions**: Verify existing tool and dependency versions across workspaces
2. **Validate Approved Libraries**: Ensure only libraries from adoption documentation are used
3. **Identify Inconsistencies**: Report any version differences or unapproved library usage found
4. **Request Human Approval**: Never proceed with version changes or new libraries without explicit approval
5. **Reopen Technical Analysis**: If new libraries needed, follow `.pair/how-to/09-how-to-create-tasks.md` to reopen task analysis
6. **Document Decisions**: Create ADR for approved version differences or library additions
7. **Update Standards**: Modify adoption documentation to reflect approved changes

## Prerequisites Verification

### Step 0: Sprint Analysis and Task Identification

**AI Assistant Instructions:** Begin with comprehensive sprint and development status analysis:

**Phase 0A: Current Sprint Status Analysis**

1. **Analyze Git Status**: Check current development state:

   ```bash
   # Verify git status and active branches
   git status
   git branch -a
   # Check for work in progress
   git log --oneline -10
   ```

2. **Review Sprint Progress**: Examine current sprint status:

   - Identify stories in progress with active branches
   - Review story and task completion status
   - Analyze development workflow state
   - Check for blocked or pending tasks

3. **Identify Project Management Tool**: Reference `.pair/tech/adopted/way-of-working.md` to determine:
   - Current project management system (file system, Jira, etc.)
   - Story and task tracking mechanism
   - Status update procedures
   - Progress tracking requirements

**Phase 0B: Work Continuation or New Task Selection**

4. **Check for Active Work**: Determine current development status:

   **IF Active Development Found:**
   _"I've detected active development on branch '[BRANCH_NAME]' for User Story '[STORY_ID]'. The story is currently in progress with [X] tasks completed and [Y] tasks remaining. Based on the git history and task status, the next task to implement is '[TASK_ID]: [TASK_DESCRIPTION]'. Should we continue with this active work or switch to a different story?"_

   **IF No Active Work:**
   _"No active development detected. All git staging is clean and we're on main branch. I'll analyze the current sprint for the next story to implement."_

5. **Sprint Story Analysis**: Review current sprint stories:

   | Story ID  | Title   | Status      | Assigned | Progress       | Priority |
   | --------- | ------- | ----------- | -------- | -------------- | -------- |
   | [Story 1] | [Title] | In Progress | Dev A    | 3/5 tasks done | High     |
   | [Story 2] | [Title] | TODO        | -        | Ready          | High     |
   | [Story 3] | [Title] | TODO        | -        | Ready          | Medium   |

6. **Propose Next Story**: Based on analysis, recommend story for implementation:

   _"Based on sprint analysis, I recommend implementing User Story '[STORY_ID]: [STORY_NAME]' because [reasoning: priority, readiness, dependencies, team capacity]. This story has [X] tasks ready for implementation following established technical patterns. Would you like to proceed with this story or select a different one from the available TODO stories?"_

**Phase 0C: Development Environment Validation**

7. **Verify Development Readiness**: Before starting implementation:

   - **Git Status Clean**: Verify no uncommitted changes
   - **Main Branch Active**: Confirm currently on main branch
   - **Dependencies Updated**: Check if dependencies need updating
   - **Environment Ready**: Validate development environment setup

**If Environment Not Ready:**
_"I notice the development environment isn't ready for new implementation. Current issues: [specific issues found]. Please resolve these issues before we can proceed with task implementation:_

- _Clean git staging area (or stash changes)_
- _Switch to main branch_
- _[Other specific requirements]_

_Once resolved, we can proceed with story selection and implementation."_

## Development Workflow Integration

### Workflow Process Analysis

**AI Assistant Instructions:** Analyze and apply development workflow from adoption guidelines:

**Workflow Components Review:**

1. **Project Management Integration**: Reference `.pair/tech/adopted/way-of-working.md` for:

   - Story status management procedures
   - Task progress tracking mechanisms
   - Epic and story relationship handling
   - Team assignment and progress reporting

2. **Git Workflow Standards**: Apply established patterns for:

   - Branch naming conventions with story code requirements
   - Commit message standards and formatting
   - Progress tracking through commit history
   - Integration with main branch procedures

3. **Development Process Standards**: Follow knowledge base guidelines:
   - Code development workflow from `.pair/tech/knowledge-base/development-workflow.md`
   - Testing integration procedures
   - Code quality standards and validation
   - Continuous integration requirements

## Step-by-Step Implementation Process

### Step 1: Story Selection and Assignment

**AI Assistant Instructions:** Handle story selection and workflow initialization:

1. **Finalize Story Selection**: Confirm story choice with developer:

   _"Proceeding with User Story '[STORY_ID]: [STORY_NAME]'. This story includes [X] tasks addressing [functional area] with clear acceptance criteria. The implementation will follow [architectural patterns] established in our technical guidelines."_

2. **Update Story Status**: Modify story status according to project management tool:

   **File System Tool:**

   - Move story file from TODO to In Progress status
   - Update story metadata with assignment and start date
   - Ensure parent epic status is also In Progress

   **Other Tools (Jira, etc.):**

   - Update story status through appropriate API or interface
   - Assign story to development team member
   - Verify epic status alignment

3. **Validate Epic Status**: Ensure parent epic is properly managed:
   - Check if epic is currently In Progress
   - Update epic status if necessary
   - Maintain epic-story relationship consistency

**Status Update Confirmation:**
_"Story '[STORY_ID]: [STORY_NAME]' is now assigned and In Progress. Parent Epic '[EPIC_ID]' status updated to In Progress. The story includes [task summary] ready for implementation. Proceeding with development workflow setup."_

### Step 2: Branch Creation and Workflow Setup

**AI Assistant Instructions:** Set up development branch following standards:

1. **Verify Git Environment**: Confirm readiness for branch creation:

   ```bash
   # Verify clean staging and main branch
   git status
   git branch --show-current
   # Ensure main is up to date
   git pull origin main
   ```

2. **Apply Branch Naming Convention**: Create branch following established pattern:

   **Standard Convention Requirements:**

   - MUST include story code in branch name
   - Follow established naming pattern from way-of-working
   - Use descriptive but concise naming
   - Maintain consistency with team standards

   **Example Convention:** `feature/[STORY_CODE]-[brief-description]`

3. **Propose Branch Creation**: Present branch name for approval:

   _"Ready to create development branch for implementation. Proposed branch name: '[BRANCH_NAME]' following our naming convention with story code '[STORY_CODE]' included. This branch will be created from main branch with current clean status. Proceed with branch creation?"_

4. **Execute Branch Creation**: Upon approval, create and switch to branch:
   ```bash
   # Create and checkout new branch
   git checkout -b [BRANCH_NAME]
   git push -u origin [BRANCH_NAME]
   ```

**Branch Setup Confirmation:**
_"Development branch '[BRANCH_NAME]' created and active. Environment ready for task implementation. The branch is properly configured with upstream tracking and follows established naming conventions."_

### Step 3: Implementation Strategy Selection

**AI Assistant Instructions:** Determine task execution approach:

1. **Present TDD Implementation Options**: Offer TDD-compliant approaches:

   _"Story '[STORY_ID]' contains [X] tasks ready for implementation. I will implement all tasks using Test-Driven Development (TDD) methodology. I can proceed with either approach:_

   **Option A: Task-by-Task TDD Cycles**

   - _Complete RED-GREEN-REFACTOR cycle for each task individually_
   - _Review and approve each task's TDD cycle before proceeding_
   - _Provides granular progress tracking with full TDD validation_
   - _Each task gets individual commits for test/implementation phases_

   **Option B: Feature-Complete TDD Implementation**

   - _Execute all TDD cycles for all tasks in sequence_
   - _Show progress tracking throughout all TDD phases_
   - _Single review after all tasks complete their TDD cycles_
   - _Consolidated review of complete feature with full test coverage_

   _Both approaches strictly follow TDD methodology with separate sessions for tests and implementation. Which TDD implementation approach would you prefer?"_

2. **Configure TDD Progress Tracking**: Set up TDD phase monitoring:

   **Task-by-Task TDD Tracking:**

   ```
   Task-001: [Description]
   🔴 RED: Tests written and failing
   ⏳ GREEN: Implementation pending
   ⏳ REFACTOR: Improvement pending

   Task-002: [Description]
   ⏳ RED: Tests pending
   ⏳ GREEN: Implementation pending
   ⏳ REFACTOR: Improvement pending
   ```

   **Feature-Complete TDD Tracking:**

   ```
   Story TDD Progress: [X/Y] tasks completed ([percentage]%)

   Task-001: ✅ RED → ✅ GREEN → ✅ REFACTOR - COMPLETE
   Task-002: ✅ RED → ✅ GREEN → 🔄 REFACTOR - IN PROGRESS
   Task-003: ✅ RED → ⏳ GREEN → ⏳ REFACTOR - PENDING
   Task-004: ⏳ RED → ⏳ GREEN → ⏳ REFACTOR - PENDING
   ```

3. **Apply TDD Implementation Standards**: Reference technical guidelines:
   - TDD methodology from `.pair/tech/knowledge-base/testing-guidelines.md`
   - Code standards from `.pair/tech/knowledge-base/code-standards.md`
   - Architecture patterns from `.pair/tech/adopted/architecture.md`
   - Quality standards from definition of done

### Step 4: TDD Task Implementation Execution

**AI Assistant Instructions:** Execute TDD implementation following strict methodology:

1. **Load Technical Context**: Before any implementation, review:

   **Foundation Documentation:**

   - Product requirements from `.pair/product/adopted/PRD.md`
   - Technical architecture from `.pair/tech/adopted/architecture.md`
   - Technology standards from `.pair/tech/adopted/tech-stack.md`
   - UX/UI guidelines from `.pair/tech/adopted/ux-ui.md`

   **Knowledge Base Guidelines:**

   - [Development workflow standards](../../tech/knowledge-base/01-architectural-guidelines.md)
   - [Code quality and convention standards](../../tech/knowledge-base/02-code-design-guidelines.md)
   - [Testing strategy and implementation patterns](../../tech/knowledge-base/07-testing-strategy.md)
   - [API design and integration approaches](../../tech/knowledge-base/01-architectural-guidelines.md)
   - [Database patterns and data access standards](../../tech/knowledge-base/01-architectural-guidelines.md)

   **Domain Context:**

   - Subdomain boundaries from `.pair/product/adopted/subdomain/`
   - Bounded context definitions from `.pair/tech/adopted/boundedcontext/`

2. **Execute TDD Cycles for Each Task**: For each task, follow strict TDD phases:

   **TDD Phase Management:**

   - **RED Session**: Write ONLY failing tests for task requirements
   - **GREEN Session**: Write ONLY implementation code to pass tests
   - **REFACTOR Session**: Improve ONLY code structure while keeping tests green
   - **Never mix phases**: Each session focuses on single TDD phase only

   **Version Consistency and Library Validation:**

   - Verify all dependencies use consistent versions across workspaces
   - Ensure only approved libraries from adoption documentation are used
   - Report any version inconsistencies or unapproved library usage found
   - Request human approval before implementing any version changes or new libraries
   - If new libraries needed, reopen technical analysis following `.pair/how-to/09-how-to-create-tasks.md`
   - Document approved version exceptions or library additions with detailed justification

3. **TDD Progress Tracking Based on Selected Approach**:

   **Task-by-Task TDD Implementation:**

   ```
   Current Task: Task-001 - [Task Description]
   🔴 RED Session: Writing failing tests for task requirements

   Test Coverage Planning:
   ✅ Core functionality tests identified
   ✅ Edge case scenarios planned
   ✅ Error condition tests designed
   🔄 Writing test implementations

   Next: GREEN session to implement functionality
   ```

   **Feature-Complete TDD Implementation:**

   ```
   Story TDD Progress: Task-002 GREEN phase ([40%] complete)

   ✅ Task-001: RED → GREEN → REFACTOR - COMPLETE
   🟢 Task-002: RED → GREEN - IN PROGRESS
   ⏳ Task-003: RED → GREEN → REFACTOR - PENDING
   ⏳ Task-004: RED → GREEN → REFACTOR - PENDING

   Current Session: GREEN - Implementing Task-002 functionality
   ```

4. **TDD Session Execution Protocol**:

   **RED Session (Tests Only):**

   - Analyze task specification for testable behaviors
   - Write comprehensive test scenarios covering requirements
   - Ensure all tests fail with meaningful error messages
   - Validate test completeness before session end
   - Commit failing tests with RED phase message

   **GREEN Session (Implementation Only):**

   - Write minimal code to make failing tests pass
   - Focus solely on satisfying test requirements
   - Avoid over-engineering or additional features
   - Validate all tests now pass before session end
   - Commit implementation with GREEN phase message

   **REFACTOR Session (Structure Improvement):**

   - Improve code and test structure without changing behavior
   - Enhance readability and adherence to standards
   - Maintain green test state throughout refactoring
   - Document structural improvements made
   - Commit improvements with REFACTOR phase message

### Step 5: TDD Task Review Process (if task-by-task selected)

**AI Assistant Instructions:** Handle individual TDD cycle review and completion:

1. **TDD Cycle Completion Notification**: After each complete RED-GREEN-REFACTOR cycle:

   _"Task '[TASK_ID]: [TASK_DESCRIPTION]' TDD implementation completed. The task has successfully completed all TDD phases:_

   **RED Phase (Tests):**

   - _Tests written covering: [specific test scenarios]_
   - _All tests initially failing as expected_
   - _Comprehensive coverage of requirements and edge cases_
   - _Committed: [RED commit hash]_

   **GREEN Phase (Implementation):**

   - _Minimal implementation written to pass all tests_
   - _All tests now passing successfully_
   - _Implementation follows [technical pattern reference]_
   - _Committed: [GREEN commit hash]_

   **REFACTOR Phase (Improvement):**

   - _Code structure improved for [specific improvements]_
   - _All tests remain green throughout refactoring_
   - _Enhanced adherence to [coding standards reference]_
   - _Committed: [REFACTOR commit hash]_

   _The implementation addresses acceptance criteria '[AC_REFERENCE]' with complete test coverage. Please review the TDD cycle completion for:_

   - _Test coverage completeness and quality_
   - _Implementation correctness and minimality_
   - _Code structure and standard compliance_
   - _Integration with existing codebase_

   _Ready for your review and approval to proceed to next task."_

2. **Handle TDD Cycle Review Feedback**: Process developer feedback for complete cycle:

   **If Approved:**

   - Mark task as completed in story tracking
   - Update TDD progress indicators
   - Proceed with next task's RED phase
   - Maintain TDD methodology for remaining tasks

   **If Changes Requested:**

   - Identify which TDD phase requires modification
   - Execute appropriate single-phase session (RED/GREEN/REFACTOR)
   - Re-validate TDD cycle completion
   - Request additional review of TDD modifications

3. **Progress to Next Task TDD Cycle**: Continue with remaining tasks:
   - Update TDD progress tracking display
   - Load next task specifications for RED phase
   - Begin new RED-GREEN-REFACTOR cycle
   - Maintain strict TDD session separation

### Step 6: Complete Story TDD Review Process (if feature-complete selected)

**AI Assistant Instructions:** Handle complete story TDD implementation and review:

1. **Story TDD Implementation Completion**: After all tasks complete TDD cycles:

   _"User Story '[STORY_ID]: [STORY_NAME]' TDD implementation completed. All [X] tasks have been implemented following strict Test-Driven Development methodology:_

   **TDD Implementation Summary:**

   - _Total TDD cycles completed: [X] (RED-GREEN-REFACTOR for each task)_
   - _Test coverage: [coverage percentage] with [number] tests written_
   - _Implementation commits: [number] GREEN phase commits_
   - _Refactoring commits: [number] REFACTOR phase commits_

   **TDD Quality Validation:**

   - _All tests written before implementation (RED phase compliance)_
   - _All tests passing after implementation (GREEN phase compliance)_
   - _Code structure improved without behavior changes (REFACTOR phase compliance)_
   - _No mixed test/implementation sessions executed_

   **Technical Standards Applied:**

   - _Architecture: [specific patterns used with references]_
   - _Code Standards: [conventions followed with references]_
   - _Testing Coverage: [TDD strategy applied with coverage metrics]_
   - _Quality Assurance: [standards met with validation details]_

   **Acceptance Criteria Coverage:**

   - _AC-1: [Addressed by tasks X, Y with test validation]_
   - _AC-2: [Addressed by tasks Y, Z with test validation]_
   - _[Continue for all acceptance criteria with test traceability]_

   _Complete story ready for TDD-compliant review and approval."_

2. **Handle Comprehensive TDD Review**: Process complete TDD implementation feedback:

   **TDD Review Areas:**

   - Test-first development compliance (RED phase validation)
   - Implementation minimality and correctness (GREEN phase validation)
   - Code structure improvements (REFACTOR phase validation)
   - Session separation adherence (no mixed test/code sessions)
   - Complete test coverage of all acceptance criteria
   - Integration correctness with full test validation

3. **Execute Story Completion Process**: Following TDD-established procedures:
   - Mark all tasks as completed with TDD validation in project management
   - Update story status to TDD-complete/ready for merge
   - Validate complete TDD commit history (RED-GREEN-REFACTOR pattern)
   - Update epic progress based on TDD-validated story completion
   - Prepare for code review process with comprehensive test coverage

### Step 7: TDD Implementation Documentation and Handoff

**AI Assistant Instructions:** Document TDD implementation and prepare for next phase:

1. **Create TDD Implementation Summary**: Document TDD-compliant work:

   **TDD Technical Implementation Record:**

   - Tasks completed with full RED-GREEN-REFACTOR cycle documentation
   - Test coverage metrics and quality validation
   - Code changes made with TDD compliance verification
   - Implementation patterns followed with test-first validation
   - Quality assurance validation with TDD methodology adherence

2. **Update Project Management System**: Ensure accurate TDD status tracking:

   **TDD Story Status Updates:**

   - Mark story as "TDD Implementation Complete" with test coverage metrics
   - Update task completion status with TDD phase completion indicators
   - Verify epic progress reflects TDD-validated story completion
   - Maintain traceability from requirements through tests to implementation

3. **Prepare for Code Review Process**: Set up next phase with TDD validation:

   - Validate branch contains complete TDD commit history
   - Ensure all commits follow TDD phase separation (RED/GREEN/REFACTOR)
   - Verify implementation completeness with comprehensive test coverage
   - Document any architectural decisions made during TDD implementation
   - Prepare handoff to code review process with TDD compliance documentation

**TDD Implementation Completion:**
_"User Story '[STORY_ID]: [STORY_NAME]' TDD implementation is complete and ready for code review. All tasks have been implemented following strict Test-Driven Development methodology with complete test coverage. The implementation addresses all acceptance criteria with full test validation and maintains consistency with architectural patterns. Branch '[BRANCH_NAME]' contains complete TDD commit history (RED-GREEN-REFACTOR cycles) and is ready for the code review process."_

## Quality Assurance Framework

### TDD Quality Standards

**TDD Methodology Compliance:**

- [ ] **RED Phase Compliance**: All tests written before implementation code
- [ ] **GREEN Phase Compliance**: Minimal implementation written to pass tests only
- [ ] **REFACTOR Phase Compliance**: Code improvements made without behavior changes
- [ ] **Session Separation**: No mixed test/implementation modifications in same session
- [ ] **Complete Cycles**: All tasks completed full RED-GREEN-REFACTOR cycles
- [ ] **Test Coverage**: Comprehensive test coverage for all acceptance criteria
- [ ] **Failing Tests**: All tests initially failed with meaningful error messages
- [ ] **Passing Tests**: All tests pass after implementation phase completion

**Implementation Quality Requirements:**

- [ ] **Standard Compliance**: All code follows established conventions from `.pair/tech/knowledge-base/code-standards.md`
- [ ] **Architecture Alignment**: Implementation follows patterns from `.pair/tech/adopted/architecture.md`
- [ ] **Technology Standards**: Uses approved technologies from `.pair/tech/adopted/tech-stack.md`
- [ ] **Testing Coverage**: Includes required tests per `.pair/tech/knowledge-base/testing-guidelines.md`
- [ ] **Version Consistency**: All dependencies use consistent versions across workspaces
- [ ] **Documentation**: Code includes appropriate documentation and comments
- [ ] **Performance**: Meets performance requirements from guidelines
- [ ] **Security**: Follows security standards from `.pair/tech/knowledge-base/security-standards.md`

**Implementation Completeness:**

- [ ] **Task Specifications**: All task requirements implemented exactly as specified
- [ ] **Acceptance Criteria**: All story acceptance criteria addressed by implementation
- [ ] **Technical References**: Implementation follows referenced patterns and guidelines
- [ ] **Integration Points**: External dependencies and APIs properly integrated
- [ ] **Error Handling**: Appropriate error handling and validation implemented
- [ ] **User Experience**: UI/UX follows established patterns from guidelines
- [ ] **Data Handling**: Data access and persistence follows established patterns
- [ ] **Configuration**: Proper configuration management and environment handling

**Process Compliance:**

- [ ] **Branch Management**: Development branch properly created with standard naming
- [ ] **Commit Standards**: All commits follow established message formatting with TDD phases
- [ ] **Progress Tracking**: Task and story status accurately maintained with TDD indicators
- [ ] **Review Process**: Appropriate review checkpoints completed for TDD cycles
- [ ] **Status Updates**: Project management system properly updated with TDD completion
- [ ] **Documentation Updates**: Any new patterns or decisions properly documented
- [ ] **Epic Management**: Parent epic status properly maintained
- [ ] **Handoff Preparation**: Implementation ready for code review process with TDD documentation

### Version Consistency Validation

**Version Consistency and Library Management:**

- [ ] **TypeScript Version**: Identical version across all workspaces without exception
- [ ] **Framework Versions**: Consistent major and minor versions across workspaces
- [ ] **Library Dependencies**: Aligned versions for shared libraries and utilities
- [ ] **Approved Libraries Only**: Only libraries from adoption documentation used
- [ ] **Exact Library Versions**: Specified versions from adoption documentation used exactly
- [ ] **No Unapproved Additions**: No new libraries added without technical analysis reopening
- [ ] **Development Tools**: Consistent tooling versions for build and development
- [ ] **Exception Documentation**: Any approved version differences properly documented with ADR
- [ ] **Human Approval**: All version changes and library additions explicitly approved by human developer
- [ ] **Justification Records**: Technical reasons for version differences clearly documented
- [ ] **Standard Updates**: Adoption documentation updated to reflect approved changes

## Best Practices for AI Assistants

### TDD-Specific Do's:

- **Always follow strict TDD methodology** with complete RED-GREEN-REFACTOR cycles for every task
- **Write tests first in dedicated sessions** without any implementation code modifications
- **Implement minimal code in separate sessions** focused solely on making tests pass
- **Never modify tests and implementation together** - maintain strict session separation
- **Validate test failures are meaningful** before proceeding to implementation phase
- **Ensure complete test coverage** for all task requirements and acceptance criteria
- **Commit each TDD phase separately** with clear phase identification in commit messages
- **Maintain green test state** throughout refactoring sessions without behavior changes

### General Do's:

- **Always analyze sprint status first** to identify active work or next story priority
- **Verify git environment cleanliness** before creating new branches or starting work
- **Follow established naming conventions** for branches, commits, and documentation
- **Reference complete technical context** including architecture, standards, and guidelines
- **Implement exactly to task specifications** without deviation from documented approach
- **Maintain version consistency** across all workspaces and dependencies
- **Request human approval** for any version changes or architectural decisions
- **Provide clear progress tracking** with regular status updates and completion markers
- **Document implementation decisions** and maintain traceability to requirements
- **Validate quality standards** throughout implementation process

### TDD-Specific Don'ts:

- **Never write implementation before tests** - always start with RED phase
- **Don't modify tests and code together** - maintain strict session separation
- **Never skip test failure validation** - ensure tests fail for correct reasons
- **Don't over-engineer in GREEN phase** - write minimal code to pass tests
- **Never change behavior during REFACTOR** - improve structure only
- **Don't commit mixed changes** - each commit should represent single TDD phase
- **Never add features not covered by tests** - implement only what tests require
- **Don't skip REFACTOR phase** when code structure needs improvement

### General Don'ts:

- **Never start implementation** without analyzing current sprint status and active work
- **Don't create branches** with uncommitted changes or when not on main branch
- **Never implement version differences** without explicit human approval and documentation
- **Don't deviate from task specifications** without documented justification and approval
- **Never skip testing requirements** established in testing strategy guidelines
- **Don't ignore architectural patterns** established in adoption and knowledge base documentation
- **Never commit work** without following established commit message standards
- **Don't update project status** without following established workflow procedures
- **Never skip quality validation** against established standards and conventions
- **Don't proceed to code review** without complete implementation validation

## Common Pitfalls and Solutions

| Pitfall                                       | Impact                                                    | Solution                                                                             |
| --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Writing tests and implementation together** | Violates TDD methodology and reduces test effectiveness   | Maintain strict session separation - tests only in RED, implementation only in GREEN |
| **Writing redundant type-system tests**       | Wastes time and creates test maintenance burden           | Focus on business logic tests - avoid testing compiler-enforced constraints          |
| **Adding unapproved libraries**               | Breaks architectural consistency and deployment processes | Use only libraries specified in adoption documentation with exact versions           |
| **Testing trivial assignments**               | Creates meaningless test coverage without value           | Test meaningful behavior, edge cases, and business logic instead                     |
| **Skipping test failure validation**          | Tests may not actually test intended behavior             | Always run tests to confirm meaningful failures before implementation                |
| **Over-engineering in GREEN phase**           | Adds complexity not required by tests                     | Write minimal code to pass tests - defer improvements to REFACTOR phase              |
| **Modifying tests during implementation**     | Invalidates test-first approach                           | Never change tests during GREEN phase - implementation must satisfy existing tests   |
| **Skipping REFACTOR phase**                   | Accumulates technical debt and poor structure             | Always evaluate if refactoring improves code structure while keeping tests green     |
| **Mixed TDD phase commits**                   | Obscures TDD process and makes reviews difficult          | Each commit should represent single TDD phase with clear phase identification        |
| **Incomplete test coverage**                  | Missing edge cases and error conditions                   | Write comprehensive tests covering happy path, edge cases, and error scenarios       |
| **Skipping sprint analysis**                  | Working on wrong priorities or duplicating active work    | Always analyze current sprint and git status before starting                         |
| **Version inconsistency introduction**        | Breaking builds and deployment processes                  | Validate version consistency and request approval for changes                        |
| **Deviating from task specifications**        | Implementation doesn't meet requirements                  | Follow task specifications exactly with referenced guidelines                        |
| **Poor branch management**                    | Git workflow confusion and merge conflicts                | Follow established branch naming and management procedures                           |
| **Incomplete progress tracking**              | Lost visibility into development status                   | Maintain accurate status updates in project management system                        |
| **Missing architectural compliance**          | Technical debt and system inconsistency                   | Reference and apply established architectural patterns consistently                  |
| **Inadequate commit documentation**           | Poor traceability and review difficulties                 | Follow commit standards with clear messages and TDD phase references                 |
| **Skipping quality validation**               | Technical debt and maintenance issues                     | Apply quality standards systematically throughout implementation                     |
| **Improper handoff preparation**              | Delays in code review process                             | Complete implementation documentation and validation before handoff                  |

## TDD Session Examples

### Example 1: RED Session (Test Writing)

**Task**: Implement user registration validation

**RED Session Focus**: Write failing tests only

```typescript
// RED Session - tests/user-registration.test.ts
describe("User Registration Validation", () => {
  it("should accept valid email and password", () => {
    const result = validateRegistration("user@example.com", "SecurePass123");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject invalid email format", () => {
    const result = validateRegistration("invalid-email", "SecurePass123");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Invalid email format");
  });

  it("should reject weak password", () => {
    const result = validateRegistration("user@example.com", "123");
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Password must be at least 8 characters");
  });
});
```

**RED Commit**:

```bash
git commit -m "US-123: Add failing tests for user registration validation - RED phase

Tests cover:
- Valid email and password acceptance
- Invalid email format rejection
- Weak password rejection

All tests failing as expected - validateRegistration function not implemented"
```

### Example 2: GREEN Session (Implementation)

**GREEN Session Focus**: Minimal implementation to pass tests only

```typescript
// GREEN Session - src/user-registration.ts
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateRegistration(
  email: string,
  password: string
): ValidationResult {
  const errors: string[] = [];

  // Minimal email validation to pass test
  if (!email.includes("@") || !email.includes(".")) {
    errors.push("Invalid email format");
  }

  // Minimal password validation to pass test
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

**GREEN Commit**:

```bash
git commit -m "US-123: Implement user registration validation to pass tests - GREEN phase

Implementation includes:
- Basic email format validation
- Password length validation
- ValidationResult interface and function

All tests now passing - ready for refactoring"
```

### Example 3: REFACTOR Session (Structure Improvement)

**REFACTOR Session Focus**: Improve structure while keeping tests green

```typescript
// REFACTOR Session - src/user-registration.ts
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email: string): string[] {
  const errors: string[] = [];
  if (!EMAIL_REGEX.test(email)) {
    errors.push("Invalid email format");
  }
  return errors;
}

function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push("Password must be at least 8 characters");
  }
  return errors;
}

export function validateRegistration(
  email: string,
  password: string
): ValidationResult {
  const errors = [...validateEmail(email), ...validatePassword(password)];

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

**REFACTOR Commit**:

```bash
git commit -m "US-123: Refactor user registration validation structure - REFACTOR phase

Improvements:
- Extract email validation to separate function
- Extract password validation to separate function
- Add constants for validation rules
- Improve code organization and readability

All tests passing - task implementation complete"
```

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- [Product vision, user personas, and requirements](../../product/adopted/PRD.md)
- [Development methodology and process definitions](../../way-of-working.md)
- [Current sprint stories and tasks](../../product/backlog/03-user-stories/current-sprint/)
- [Commit and push procedures](../how-to/12-how-to-commit-and-push.md)

**Technical Context:**

- [System architecture patterns and design decisions](../../tech/adopted/architecture.md)
- [Technology choices and implementation standards](../../tech/adopted/tech-stack.md)
- [Infrastructure and deployment requirements](../../tech/adopted/infrastructure.md)
- [User interface patterns and interaction guidelines](../../tech/adopted/ux-ui.md)
- [Technical workflow and tool configuration](../../tech/adopted/way-of-working.md)

**Domain Context:**

- [Functional boundaries affecting implementation scope](../../product/adopted/subdomain/)
- [Technical boundaries affecting implementation](../../tech/adopted/boundedcontext/)

**Knowledge Base (Complete Technical Guidelines):**

### 🏗️ Architecture & Design

- **[01-architectural-guidelines.md](01-architectural-guidelines.md)** - System architecture patterns, bounded contexts, and ADR processes
- **[02-code-design-guidelines.md](02-code-design-guidelines.md)** - Code organization, design patterns, and implementation standards

### ⚙️ Technical Implementation

- **[03-technical-guidelines.md](03-technical-guidelines.md)** - Tech stack, development tools, and feature flag management
- **[04-infrastructure-guidelines.md](04-infrastructure-guidelines.md)** - Deployment strategies, environment management, and CI/CD

### 🎨 User Experience & Quality

- **[05-ux-guidelines.md](05-ux-guidelines.md)** - User experience standards and design principles
- **[06-definition-of-done.md](06-definition-of-done.md)** - Quality criteria and completion standards
- **[07-testing-strategy.md](07-testing-strategy.md)** - Testing frameworks, strategies, and quality gates

### 🔒 Security & Performance

- **[08-accessibility-guidelines.md](08-accessibility-guidelines.md)** - Accessibility standards and compliance requirements
- **[09-performance-guidelines.md](09-performance-guidelines.md)** - Performance optimization and monitoring strategies
- **[10-security-guidelines.md](10-security-guidelines.md)** - Security implementation and best practices
- **[11-observability-guidelines.md](11-observability-guidelines.md)** - Monitoring, logging, and tracing strategies

**Process Dependencies:**

- **Prerequisites**: Tasks from refined user story ready for implementation
- **Input**: Task specifications serve as implementation requirements
- **Output**: Working code with comprehensive test coverage ready for code review process
- **TDD Methodology**: All implementation must follow strict Test-Driven Development practices
- **Standard References**: All implementation must follow knowledge base and adoption guidelines
- **Version Consistency**: Maintain consistent versions across workspaces with human approval for exceptions
- **Next Phase**: TDD-compliant code ready for **How to Code Review** process

**Related Documents:**

- Previous: [09-how-to-create-tasks.md](./09-how-to-create-tasks.md)
- Bootstrap Checklist: [03-how-to-complete-bootstrap-checklist.md](./03-how-to-complete-bootstrap-checklist.md)
- Next: [11-how-to-code-review.md](./11-how-to-code-review.md)

This guide ensures systematic, high-quality task implementation that follows established technical standards and strict Test-Driven Development methodology while maintaining development workflow consistency and preparing code for effective review processes.
