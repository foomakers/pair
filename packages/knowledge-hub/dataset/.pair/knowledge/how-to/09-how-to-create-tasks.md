# How to Create Tasks (from User Stories) - AI-Assisted Guide

## Overview

This guide enables Product Software Engineers and AI assistants to collaboratively decompose refined User Stories into specific, actionable development tasks that can be implemented by the development team. Tasks serve as **concrete implementation steps** that translate story acceptance criteria into executable work items following established technical guidelines and architectural patterns.

**Key Benefits of Task Creation:**

- Transform refined user stories into executable development work
- Ensure technical consistency with adopted architectural patterns
- Enable precise progress tracking through task completion
- Provide clear implementation guidance following established standards
- Facilitate accurate effort estimation and sprint planning
- Maintain traceability from business requirements to implementation details

**Important: Tasks are created from refined user stories** - they represent the detailed implementation steps needed to deliver the story's acceptance criteria while adhering to established technical standards and architectural decisions.

## AI Assistant Role Definition

**Primary Role**: Product Software Engineer

The AI assistant acts as a **Product Software Engineer** who:

- **Analyzes** refined user stories to identify implementation requirements
- **Proposes** task breakdown following established technical guidelines and architectural patterns
- **Applies** adopted technical standards from architecture, infrastructure, tech stack, and UX/UI guidelines
- **References** knowledge base documentation for implementation guidance
- **Documents** tasks with clear implementation direction and standard references
- **Reviews** task breakdown collaboratively with development team
- **Maintains** consistency with established technical decisions and ADRs

**Working Principles**: Follow the **🤖🤝👨‍💻** model (AI proposes, Developer validates) throughout the entire task creation process.

## Prerequisite

Before starting, **read and consult the Task Template**: [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md). All required structure and fields are defined in the template.

## **Issue Access and Tool Integration**

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks. NEVER deviate from this process.**

### **Access Protocol**

**Step 1: Tool Configuration Check**

1. **Read** [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:

_"I cannot proceed because no project management tool is configured in [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md). Complete bootstrap first: [How to Complete Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) for all access procedures
- **Use configured tool** as primary and authoritative source for all issue data

### **Filesystem Access Rules**

**✅ PERMITTED ONLY when:**

- Tool in [way-of-working.md](.pair/adoption/tech/way-of-working.md) = "filesystem"

**🚫 PROHIBITED when:**

- Any other tool is configured
- **DO NOT** read [.pair/adoption/product/backlog/](.pair/adoption/product/backlog/) directories
- **DO NOT** use filesystem as fallback

### **Validation Checklist**

- [ ] [way-of-working.md](.pair/adoption/tech/way-of-working.md) read and tool identified
- [ ] Tool configured (if not: halt and request bootstrap)
- [ ] [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) consulted for access procedures

## Task Definition

### What is a Task (from User Story)?

A **Task from a User Story** is a **specific implementation step** that:

- **Implements Acceptance Criteria**: Directly addresses specific acceptance criteria from the refined user story
- **Follows Technical Standards**: Adheres to adopted architecture, tech stack, and implementation patterns
- **Provides Clear Direction**: Specifies what to implement with references to standard solutions
- **Enables Progress Tracking**: Can be marked complete when implementation is finished
- **Maintains Traceability**: Links back to user story value and epic objectives
- **References Standards**: Points to specific documentation for implementation details

**Tasks are concrete and actionable** - they provide clear implementation guidance while referencing established technical standards rather than reinventing solutions.

### Task vs Other Artifacts

| Artifact       | Scope                | Purpose                                      | Detail Level              |
| -------------- | -------------------- | -------------------------------------------- | ------------------------- |
| **Initiative** | Business objective   | Strategic positioning and market advantage   | High-level business value |
| **Epic**       | Feature set          | Incremental value delivery                   | User experience scope     |
| **User Story** | Single functionality | Deliverable feature with acceptance criteria | Functional requirements   |
| **Task**       | Implementation step  | Executable development work                  | Technical implementation  |

---

**Project Management Tool Usage**

Before documenting tasks, identify the configured project management tool as specified in `.pair/adoption/tech/way-of-working.md`. Access the tool using the provided credentials or links. Follow the usage and collaboration instructions in `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` for interfacing, linking items, and managing task records. Please refer to this documentation any time the guide asks for project management tool actions.

---

## Task Creation Template

Each user story must explicitly indicate which bounded context it refers to, ensuring traceability between functionality and technical domain.

If implementations modify, reduce the scope of, or create new bounded contexts, you must:

- Update the structure and documentation of the affected bounded contexts
- Document the decision with an ADR
- Ensure the new structure is aligned with architectural and domain guidelines

Task must follow this comprehensive [template](.pair/knowledge/guidelines/collaboration/templates/task-template.md) you find in the [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md).

## Prerequisites Verification

### Step 0: Story Selection and Documentation Analysis

**AI Assistant Instructions:** Begin with comprehensive analysis and story selection:

**Phase 0A: Current Backlog Analysis**

1. **Priority-Based Story Selection**: Identify user stories ready for task breakdown following this priority order:

   - **Primary Target**: User stories in "Refined" state with highest priority (P0 > P1 > P2) that are not yet assigned
   - **Secondary Option**: If no refined stories available, identify stories in "Todo" state that need refinement first
   - **Story State Validation**: Confirm selected story is in "Refined" state and ready for task breakdown
   - **Assignment Check**: Story should be unassigned and ready to be assigned to a developer

Identify the current sprint based on the project management tool adopted [here](.pair/adoption/tech/way-of-working.md).
If there are no refined user stories available, inform the user about available Todo stories that need refinement first and inform you cannot proceed.

2. **Study Technical Context**: Analyze all technical documentation:

   - **Architecture Patterns**: Review `.pair/adoption/tech/architecture.md` for system design patterns
   - **Tech Stack Standards**: Study `.pair/adoption/tech/tech-stack.md` for technology choices
   - **Infrastructure Guidelines**: Examine `.pair/adoption/tech/infrastructure.md` for deployment patterns
   - **UX/UI Standards**: Review `.pair/adoption/tech/ux-ui.md` for interface guidelines
   - **Domain Boundaries**: Understand `.pair/product/adopted/subdomain/` and `.pair/adoption/tech/boundedcontext/` definitions
   - **Knowledge Base**: Review `.pair/knowledge/README.md` and all referenced technical guidelines

**Phase 0B: Story Selection and Proposal**

3. **Propose Priority Story**: Based on backlog analysis, identify and propose highest-priority story for task breakdown:

   _"I've analyzed the current backlog and technical context. Based on story state, priorities, and assignment status, I recommend creating tasks for User Story '[STORY_ID]: [STORY_NAME]' because [reasoning: Refined state, priority level, assignment readiness]._

   _Here are the Refined stories ready for task breakdown:_

   | Story ID  | Title   | Epic Context | State   | Priority | Assignment Status |
   | --------- | ------- | ------------ | ------- | -------- | ----------------- |
   | [Story 1] | [Title] | [Epic]       | Refined | P0       | Unassigned        |
   | [Story 2] | [Title] | [Epic]       | Refined | P1       | Unassigned        |
   | [Story 3] | [Title] | [Epic]       | Todo    | P0       | Needs refinement  |

   _Priority recommendation: Select highest priority (P0 > P1 > P2) Refined story that is unassigned. Which story would you like to break down into implementation tasks?"_

   **User Confirmation Required**: _"I recommend User Story '[STORY_ID]: [STORY_NAME]' (Priority [P0/P1/P2]) for task breakdown. This story will deliver [brief story value] and is ready for implementation. Should I proceed with breaking down this story into development tasks?"_

**Phase 0C: Selected Story Validation**

4. **Verify Selected Story Readiness**: Once story is selected, confirm it's ready for task breakdown:

   - **State Check**: Story must be in "Refined" state (not "Todo" or "In Progress")
   - **Assignment Check**: Story should be unassigned and ready for assignment
   - Story has clear acceptance criteria
   - Story has been refined and sized
   - Story context includes epic and initiative linkage
   - Story context includes explicit bounded context reference
   - Dependencies are identified and resolved
   - Story fits within sprint capacity

**If Selected Story Not Ready:**
_"I notice the selected story '[STORY_ID]' is not in 'Refined' state and isn't ready for task breakdown. The story is currently in '[CURRENT_STATE]' state and needs [specific missing elements] before we can create implementation tasks._

_**Next Steps Required:**_
_- If story is in 'Todo' state: Complete story refinement process first using [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md)_
_- If story is in 'In Progress' state: Story is already being developed - check existing tasks_

_We can either complete the required process first, or select a different 'Refined' story that's ready for task breakdown. Would you prefer to refine this story or choose another ready story from the list?"_

## Technical Knowledge Base Integration

### Knowledge Base Structure

**AI Assistant Instructions:** Reference the complete technical knowledge base as described in `.pair/knowledge/README.md`:

**Core Technical Guidelines** (reference specific sections for task implementation):

- **Architectural Guidelines**: `.pair/knowledge/architecture/README.md` – System architecture patterns, ADRs, and design principles
- **Code Design Guidelines**: `.pair/knowledge/02-code-design-guidelines.md` – Code structure, design patterns, and implementation standards
- **Technical Guidelines**: `.pair/knowledge/technical-standards/README.md` – Tech stack, development tools, and integration requirements
- **Infrastructure Guidelines**: `.pair/knowledge/infrastructure/README.md` – Deployment strategies, environment management, CI/CD
- **UX Guidelines**: `.pair/knowledge/05-ux-guidelines.md` – User experience standards and design principles
- **Definition of Done**: `.pair/knowledge/06-definition-of-done.md` – Quality criteria and completion standards
- **Testing Strategy**: `.pair/knowledge/07-testing-strategy.md` – Testing frameworks, strategies, and quality gates
- **Accessibility Guidelines**: `.pair/knowledge/08-accessibility-guidelines.md` – Accessibility standards and compliance requirements
- **Performance Guidelines**: `.pair/knowledge/09-performance-guidelines.md` – Performance optimization and monitoring strategies
- **Security Guidelines**: `.pair/knowledge/10-security-guidelines.md` – Security implementation and best practices
- **Observability Guidelines**: `.pair/knowledge/guidelines/observability/README.md` – Monitoring, logging, and tracing strategies

**Task Reference Requirement**: Every task must reference specific sections from relevant knowledge base documents to provide implementation guidance while avoiding duplication of standards.

## Task Decomposition Methodology

### Task Identification Patterns

**AI Assistant Instructions:** Apply systematic patterns to identify implementation tasks:

#### 1. Acceptance Criteria Mapping

For each acceptance criterion, identify required implementation tasks:

- **Given-When-Then Analysis**: Break down each scenario into implementation steps
- **User Interaction Tasks**: UI components, forms, buttons, navigation
- **System Behavior Tasks**: Business logic, data processing, validation
- **Integration Tasks**: API calls, data persistence, external system communication

#### 2. Technical Layer Decomposition

Organize tasks by technical layers following architecture patterns:

- **Presentation Layer Tasks**: UI components, user interactions, visual feedback
- **Application Layer Tasks**: Business logic, workflow orchestration, validation
- **Domain Layer Tasks**: Core business rules, domain models, business processes
- **Infrastructure Layer Tasks**: Data access, external integrations, technical services

#### 3. Implementation Sequence Planning

Consider natural implementation order:

- **Foundation Tasks**: Core models, basic infrastructure, essential services
- **Feature Tasks**: User-facing functionality, business logic implementation
- **Integration Tasks**: System connections, data flow, external dependencies
- **Validation Tasks**: Testing, error handling, edge case coverage

### Task Sizing Guidelines

**Task Size Principles**:

- **2-4 hours maximum**: Tasks should be completable in a few hours
- **Single Developer**: One person should be able to complete the task
- **Clear Definition of Done**: Task completion should be unambiguous
- **Minimal Dependencies**: Tasks should have few blocking dependencies

## Step-by-Step Implementation Process

### Step 1: Selected Story Analysis and Context Review

**AI Assistant Instructions:** With the selected story confirmed, proceed with detailed analysis:

1. **Review Selected Story**: Analyze the chosen story comprehensively:

   - Story statement and user value proposition
   - Complete acceptance criteria and definition of done
   - Story scope and boundaries
   - Dependencies and constraints

2. **Study Parent Epic and Initiative**: Review broader context:

   - Epic objectives and success criteria
   - Initiative goals and business value
   - Related stories and integration points
   - Overall feature architecture and design

3. **Analyze Technical Requirements**: Map story requirements to technical implementation:
   - UI/UX requirements from acceptance criteria
   - Business logic and data processing needs
   - Integration and API requirements
   - Performance and security considerations

**Context Analysis Presentation:**
_"I've completed analysis of selected User Story '[STORY_ID]: [STORY_NAME]'. The story requires implementation of [key functionality] with [X] acceptance criteria addressing [user scenarios]. Based on our technical standards and the story requirements, I can identify tasks spanning [technical areas]. The implementation will follow [architectural patterns] as established in our technical guidelines. Are you ready to proceed with task identification and breakdown?"_

### Step 2: Task Identification and Mapping

**AI Assistant Instructions:** Identify specific implementation tasks:

1. **Map Acceptance Criteria to Tasks**: For each acceptance criterion:

   - Identify required UI components and user interactions
   - Determine necessary business logic and data processing
   - Specify integration points and API requirements
   - Consider testing and validation requirements

2. **Apply Technical Layer Analysis**: Organize tasks by architectural layers:

   - **Frontend Tasks**: UI components, state management, user interactions
   - **Backend Tasks**: APIs, business logic, data access
   - **Integration Tasks**: External system connections, data synchronization
   - **Testing Tasks**: Unit tests, integration tests, end-to-end validation

3. **Reference Technical Standards**: For each task area, identify applicable guidelines:

   - Architecture patterns from `.pair/adoption/tech/architecture.md`
   - Technology choices from `.pair/adoption/tech/tech-stack.md`
   - UI/UX standards from `.pair/adoption/tech/ux-ui.md`
   - Infrastructure requirements from `.pair/adoption/tech/infrastructure.md`
   - Domain boundaries from subdomain and bounded context definitions

4. **Apply Knowledge Base Guidelines**: Reference specific implementation approaches:
   - Development workflow and processes
   - Code standards and conventions
   - Testing strategies and patterns
   - API design and integration approaches

### Step 3: Task Definition and Technical Specification

**AI Assistant Instructions:** Define each task with clear implementation guidance:

1. **Create Task Specifications**: For each identified task:

   - **Clear Objective**: What specifically needs to be implemented
   - **Technical Approach**: Reference to standard patterns and guidelines
   - **Acceptance Criteria Mapping**: Which story AC this task addresses
   - **Dependencies**: Other tasks or external dependencies
   - **Bounded Context Reference**: Explicitly state the bounded context for each story and task

2. **Reference Standard Solutions**: Link tasks to established patterns:

   - Specific sections in architecture documentation
   - Relevant patterns from knowledge base
   - Technology-specific implementation guides
   - UX/UI component and interaction standards

3. **Identify Alternative Approaches**: If standard solutions don't fit:

   - Document the standard approach with references
   - Propose alternative solution with strong justification
   - Explain trade-offs and implications
   - Recommend ADR creation if alternative is selected

4. **Estimate Task Complexity**: Provide rough effort estimates:
   - Simple tasks (1-2 hours): Well-understood, standard patterns
   - Medium tasks (3-4 hours): Moderate complexity, some unknowns
   - Complex tasks (requiring splitting): Unclear requirements or novel approaches

### Step 4: Task Breakdown Presentation

**AI Assistant Instructions:** Present comprehensive task breakdown:

1. **Create Task Overview**: Present organized task list following the [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md) structure and format

2. **Justify Task Boundaries**: Explain task organization:

   - **Acceptance Criteria Coverage**: How tasks address each story requirement
   - **Technical Layer Separation**: Why tasks are organized by architectural layers
   - **Implementation Sequence**: Recommended order of task execution
   - **Standard Compliance**: How tasks follow established technical guidelines

3. **Highlight Standard References**: Emphasize guideline compliance:
   - Architecture patterns being applied
   - Knowledge base sections being followed
   - Technology standards being implemented
   - UX/UI guidelines being adopted

**Breakdown Presentation:**
_"I've identified [X] tasks for User Story '[STORY_ID]: [STORY_NAME]'. The tasks are organized by technical layers and follow our established patterns from [referenced guidelines]. Each task addresses specific acceptance criteria and references standard implementation approaches. The breakdown includes [frontend/backend/integration/testing] tasks with clear implementation guidance. All tasks follow patterns established in our technical documentation. Does this breakdown provide clear implementation direction while maintaining consistency with our technical standards?"_

### Step 5: Task Review and Technical Validation

**AI Assistant Instructions:** Collaborate on task structure refinement:

1. **Gather Feedback** on:

   - Task completeness and acceptance criteria coverage
   - Technical approach and standard compliance
   - Task sizing and implementation complexity
   - Dependencies and execution sequence

2. **Review Technical Decisions**:

   - Validate architecture pattern application
   - Confirm technology choice alignment
   - Review UX/UI standard implementation
   - Assess infrastructure requirement compliance

3. **Consider Alternative Approaches**:

   - Evaluate any proposed non-standard solutions
   - Compare trade-offs between standard and alternative approaches
   - Determine need for ADR creation
   - Update adoption documentation if alternatives are selected

4. **Refine Based on Input**:
   - Adjust task boundaries and scope
   - Split or merge tasks as needed
   - Update technical approach references
   - Modify implementation sequence

**Technical Validation Questions:**
_"Do the tasks provide clear implementation guidance while following our established technical standards? Should any tasks reference different patterns or approaches? Are there any alternative technical solutions we should consider that might provide better outcomes? Do all tasks appropriately reference our knowledge base and adoption guidelines?"_

### Step 6: Task Documentation and Integration

**AI Assistant Instructions:** Document tasks within the user story:

1. **Create Task Checklist**: Add task checklist to story:

   - Organized by technical layers (Frontend, Backend, Integration, Testing)
   - Brief task descriptions for progress tracking
   - Clear completion criteria

2. **Document Task Details**: Add detailed task descriptions:

   - **What to implement**: Clear implementation objectives
   - **Technical approach**: References to standard patterns and guidelines
   - **Acceptance criteria addressed**: Traceability to story requirements
   - **Dependencies**: Task execution order and prerequisites

3. **Include Standard References**: Document applied technical standards:

   - Architecture patterns with specific section references
   - Knowledge base guidelines with direct links
   - Technology standards with implementation details
   - UX/UI patterns with component specifications

4. **Document Alternative Solutions**: If non-standard approaches are considered:
   - Standard approach with documentation references
   - Alternative approach with justification
   - Recommendation and trade-off analysis
   - ADR requirement specification

**Task Documentation Format:**
_"Here's the task breakdown for User Story '[STORY_ID]: [STORY_NAME]'. The tasks are documented as a progress checklist with detailed implementation guidance. Each task references specific technical standards from our knowledge base and adoption guidelines. Tasks address all acceptance criteria and provide clear implementation direction. Alternative approaches are documented where relevant with ADR requirements specified."_

### Step 7: ADR Creation for Alternative Solutions

**AI Assistant Instructions:** Handle non-standard technical decisions:

1. **Identify ADR Requirements**: When alternative solutions are selected:

   - Alternative approaches that deviate from established patterns
   - Technology choices not covered in current tech stack
   - Architecture decisions that change established patterns
   - Integration approaches that differ from standard patterns

2. **Create ADR Documentation**: Follow ADR template:

   - Document the technical decision context
   - Present considered options with trade-offs
   - Record the decision and rationale
   - Specify implementation consequences

3. **Update Adoption Documentation and Bounded Contexts**: When an ADR is created for a non-standard technical decision, you must also update the relevant adoption documentation. This includes:
   - Updating architecture patterns if needed
   - Modifying tech stack documentation for new technologies
   - Revising UX/UI guidelines for new patterns
   - Updating infrastructure requirements
   - Updating the structure and documentation of affected bounded contexts if implementations change, reduce, or create new ones

The adoption update must clearly describe the impact on both technical standards and domain boundaries, ensuring all changes are traceable and aligned with project guidelines. Communicate these changes to the development team and plan adoption across similar use cases.

4. **Maintain Consistency**: Ensure ongoing alignment:
   - Update knowledge base with new patterns
   - Modify related guidelines and references
   - Communicate changes to development team
   - Plan adoption across similar use cases

### Step 8: Task Validation and Sprint Integration

**AI Assistant Instructions:** Validate task readiness and integration:

1. **Verify Task Completeness**: Confirm task breakdown quality:

   - All acceptance criteria addressed by tasks
   - Clear implementation guidance provided
   - Standard references properly documented
   - Dependencies identified and manageable

2. **Validate Sprint Readiness**: Ensure tasks are ready for development:

   - Task sizing appropriate for sprint capacity
   - Dependencies resolved or manageable
   - Technical approaches clearly specified
   - Definition of done criteria clear

3. **Confirm Standard Compliance**: Verify adherence to technical guidelines:

   - Architecture patterns properly applied
   - Technology standards correctly referenced
   - UX/UI guidelines appropriately followed
   - Knowledge base patterns consistently used

4. **Prepare for Implementation**: Set up tasks for development execution:
   - Task priorities established within story
   - Implementation sequence planned
   - Resource allocation considered
   - Progress tracking mechanisms ready

**Task Validation Summary:**
_"All tasks for User Story '[STORY_ID]: [STORY_NAME]' are documented and ready for implementation. The task breakdown addresses all acceptance criteria with clear technical guidance referencing our established standards. Tasks are appropriately sized and sequenced for sprint execution. Alternative solutions are documented with ADR requirements where applicable. The story is ready for development with complete implementation guidance."_

## Quality Assurance Framework

### Task Creation Quality Standards

**Content Quality:**

- [ ] Each task clearly states what needs to be implemented
- [ ] Tasks directly address specific acceptance criteria from the user story
- [ ] Technical approaches reference established standards and patterns
- [ ] Task sizing is appropriate (2-4 hours maximum)
- [ ] Dependencies are identified and manageable
- [ ] Standard solution references are provided with specific documentation links
- [ ] Alternative solutions are properly documented with justification

**Technical Standards Compliance:**

- [ ] **Architecture**: Tasks follow patterns from `.pair/adoption/tech/architecture.md`
- [ ] **Tech Stack**: Tasks use technologies specified in `.pair/adoption/tech/tech-stack.md`
- [ ] **UX/UI**: Tasks implement patterns from `.pair/adoption/tech/ux-ui.md`
- [ ] **Infrastructure**: Tasks align with `.pair/adoption/tech/infrastructure.md` requirements
- [ ] **Domain**: Tasks respect boundaries from subdomain and bounded context definitions
- [ ] **Knowledge Base**: Tasks reference specific guidelines from `.pair/knowledge/`

**Documentation Completeness:**

- [ ] Task checklist integrated into user story for progress tracking
- [ ] Detailed task descriptions provide implementation guidance
- [ ] Technical standard references include specific section links
- [ ] Alternative solutions documented with ADR requirements
- [ ] Bounded context impacts properly assessed and documented

**Process Compliance:**

- [ ] User story in "Refined" state before task breakdown
- [ ] Story assigned to developer upon task completion
- [ ] Story status updated to "In Progress" after task breakdown
- [ ] Epic status properly maintained according to collaboration guidelines
- [ ] Project management tool properly updated with all task details

## State Management and Assignment

### Final State Validation and Assignment

**AI Assistant Instructions:** Complete the task breakdown process with proper state management:

1. **Verify Task Completion**: Confirm all tasks are documented and ready for implementation
2. **Append Task Breakdown to User Story**: Add checkable task list to the user story body without overwriting existing content
3. **Assign Story to Developer**: Update the project management tool to assign the story to the developer who will implement it
4. **Update Story Status**: Change story status from "Refined" to "In Progress" to indicate active development
5. **Update Epic Status**: If this is the first story in the epic to move to "In Progress", update the parent epic status accordingly

### Task Breakdown Documentation

**AI Assistant Instructions:** Append task breakdown checklist to user story:

1. **Preserve Existing Content**: Read current user story body and append task breakdown without overwriting any existing content
2. **Add Task Breakdown Section**: Append task breakdown section following the [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md) format
3. **Maintain Task Traceability**: Each task in the checklist should include:
   - **Task ID**: Unique identifier for progress tracking
   - **Task Title**: Clear, descriptive title
   - **Brief Description**: One-line summary of what needs to be implemented
   - **Status**: Unchecked (will be checked when task is completed)

**Reference**: Follow the complete [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md) for proper task documentation format and structure.

**State Update Validation:**
_"✅ TASK BREAKDOWN COMPLETE: User Story '[STORY_ID]: [STORY_NAME]' has been broken down into [X] implementation tasks. Task breakdown checklist appended to user story body. The story has been assigned to [DEVELOPER] and status updated to 'In Progress'. Parent Epic '[EPIC_ID]' status updated accordingly. All tasks are documented and ready for implementation following the **How to Implement a Task** process."_

**If Tool Cannot Update Status:**
_"⚠️ ACTION REQUIRED: Task breakdown is complete, but I cannot update the story status in [TOOL_NAME]. Please manually:_
_1. Assign User Story '[STORY_ID]' to [DEVELOPER]_
_2. Change story status from 'Refined' to 'In Progress'_
_3. Update parent Epic '[EPIC_ID]' status if this is the first active story_
_4. Verify all task details are properly captured in the project management tool_
_Once updated, the story will be ready for implementation."_

- [ ] Acceptance criteria mapping maintained for traceability

### Story Coverage Validation

**Implementation Coverage:**

- [ ] **Acceptance Criteria**: All story ACs addressed by specific tasks
- [ ] **Technical Layers**: Frontend, backend, integration, and testing tasks included
- [ ] **Standard Compliance**: All tasks reference appropriate technical guidelines
- [ ] **Quality Assurance**: Testing and validation tasks included

**Sprint Integration:**

- [ ] **Task Sizing**: Individual tasks appropriately sized for completion
- [ ] **Dependencies**: Task execution order planned and manageable
- [ ] **Resource Allocation**: Tasks aligned with team capabilities
- [ ] **Progress Tracking**: Clear completion criteria for each task

## Best Practices for AI Assistants

### Do's:

- **Always analyze current backlog first** to propose appropriate stories for task breakdown
- **Reference complete technical context** including architecture, tech stack, UX/UI, and knowledge base
- **Map every acceptance criterion** to specific implementation tasks
- **Reference established patterns** rather than inventing new solutions
- **Provide specific documentation links** for all technical approaches
- **Size tasks appropriately** (2-4 hours maximum per task)
- **Organize tasks by technical layers** for clear implementation structure
- **Consider alternative solutions** when standard approaches don't fit
- **Document ADR requirements** for non-standard technical decisions
- **Validate sprint integration** and team capacity alignment
- **Maintain traceability** from business requirements to implementation tasks

### Don'ts:

- **Never skip backlog analysis** - always propose stories based on readiness and priority
- **Don't create tasks without technical references** - always link to established patterns
- **Don't ignore acceptance criteria** - ensure every AC is addressed by specific tasks
- **Don't reinvent solutions** - reference knowledge base and adoption guidelines first
- **Don't create oversized tasks** - keep tasks completable in a few hours
- **Don't forget alternative documentation** - document non-standard approaches with justification
- **Don't skip ADR creation** - alternative technical decisions require architectural decision records
- **Don't ignore dependencies** - identify and plan for task execution order
- **Don't separate technical layers artificially** - maintain cohesive implementation approach
- **Don't assume technical knowledge** - provide clear implementation guidance with references

## Common Pitfalls and Solutions

| Pitfall                                | Impact                            | Solution                                                         |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **Skipping backlog analysis**          | Working on wrong priority stories | Always analyze TODO stories and propose based on readiness       |
| **Tasks without technical references** | Inconsistent implementation       | Reference specific sections from knowledge base and adoptions    |
| **Ignoring acceptance criteria**       | Incomplete story implementation   | Map every AC to specific tasks with clear traceability           |
| **Oversized task creation**            | Implementation bottlenecks        | Keep tasks to 2-4 hours maximum with clear completion criteria   |
| **Missing alternative documentation**  | Lost technical decision context   | Document standard and alternative approaches with justification  |
| **Skipping ADR creation**              | Inconsistent technical decisions  | Create ADRs for all non-standard technical approaches            |
| **Undefined task dependencies**        | Implementation blocking issues    | Identify and plan task execution order and prerequisites         |
| **Weak implementation guidance**       | Developer confusion and delays    | Provide clear "what to implement" with specific technical links  |
| **Standard reference gaps**            | Technical inconsistency           | Ensure all tasks reference appropriate knowledge base guidelines |
| **Poor sprint integration planning**   | Capacity and timeline issues      | Validate task sizing and dependencies against sprint capacity    |

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- `.pair/product/adopted/PRD.md` - Product vision, user personas, and requirements
- `.pair/way-of-working.md` - Development methodology and process definitions
- `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` - Project Management Tool Guidelines

**Technical Context:**

- `.pair/adoption/tech/architecture.md` - System architecture patterns and design decisions
- `.pair/adoption/tech/tech-stack.md` - Technology choices and implementation standards
- `.pair/adoption/tech/infrastructure.md` - Infrastructure and deployment requirements
- `.pair/adoption/tech/ux-ui.md` - User interface patterns and interaction guidelines
- `.pair/adoption/tech/way-of-working.md` - Technical workflow and tool configuration

**Domain Context:**

- `.pair/product/adopted/subdomain/` - Functional boundaries affecting task scope
- `.pair/adoption/tech/boundedcontext/` - Technical boundaries affecting implementation

**Knowledge Base (Complete Technical Guidelines):**

### 🏗️ Architecture & Design

- **[architecture/README.md](.pair/knowledge/guidelines/architecture/README.md))** - System architecture patterns, bounded contexts, and ADR processes
- **[02-code-design-guidelines.md](.pair/knowledge/guidelines/code-design/README.md)** - Code organization, design patterns, and implementation standards

### ⚙️ Technical Implementation

- **[technical-standards/README.md](.pair/knowledge/guidelines/technical-standards/README.md)** - Tech stack, development tools, and feature flag management
- **[infrastructure/README.md](.pair/knowledge/guidelines/infrastructure/README.md)** - Deployment strategies, environment management, and CI/CD

### 🎨 User Experience & Quality

- **[05-ux-guidelines.md](.pair/knowledge/guidelines/user-experience/README.md)** - User experience standards and design principles
- **[06-definition-of-done.md](.pair/knowledge/guidelines/quality-assurance/quality-standards/definition-of-done.md)** - Quality criteria and completion standards
- **[07-testing-strategy.md](.pair/knowledge/guidelines/testing/test-strategy/README.md)** - Testing frameworks, strategies, and quality gates

### 🔒 Security & Performance

- **[08-accessibility-guidelines.md](.pair/knowledge/guidelines/quality-assurance/accessibility/README.md)** - Accessibility standards and compliance requirements
- **[09-performance-guidelines.md](.pair/knowledge/guidelines/quality-assurance/performance/README.md)** - Performance optimization and monitoring strategies
- **[10-security-guidelines.md](.pair/knowledge/guidelines/quality-assurance/security/README.md)** - Security implementation and best practices
- **[11-observability-guidelines.md](.pair/knowledge/guidelines/observability/README.md)** - Monitoring, logging, and tracing strategies

**Process Dependencies:**

- **Prerequisites**: Refined user story with clear acceptance criteria ready for task breakdown
- **Input**: User story serves as foundation for task identification and technical specification
- **Output**: Tasks documented within user story ready for implementation
- **Standard References**: All tasks must reference specific sections from knowledge base and adoption guidelines
- **Alternative Solutions**: Non-standard approaches require ADR creation and adoption updates
- **Next Phase**: Tasks ready for **How to Implement a Task** process during sprint execution

**Related Documents:**

- Previous: [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md)
- Bootstrap Checklist: [02-how-to-complete-bootstrap-checklist.md](02-how-to-complete-bootstrap-checklist.md)
- Next: [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md)

This guide ensures a systematic, technically consistent process that produces high-quality task breakdowns ready for efficient implementation while maintaining alignment with established technical standards and architectural decisions.
