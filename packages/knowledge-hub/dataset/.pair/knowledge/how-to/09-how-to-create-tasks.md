# How to Create Tasks - AI-Assisted Guide

## Overview

Transform refined User Stories into specific, actionable development tasks through structured analysis and technical breakdown. Tasks serve as concrete implementation steps that translate acceptance criteria into executable work following established technical guidelines and architectural patterns.

**Role**: Product Engineer (Story Implementation Planning)
**Process**: 🤖🤝👨‍💻 (AI proposes & structures, Developer validates & approves)

**CRITICAL FIRST STEP**: Before task creation begins, verify story refinement and project management tool configuration.

## Session State Management

**CRITICAL**: Maintain this context throughout task creation:

```
TASK CREATION STATE:
├── Story: [Story ID and Priority]
├── Breakdown Status: [foundation | selection | analysis | identification | definition | documentation | completion]
├── PM Tool: [filesystem | github-projects | jira | linear | other]
├── PM Access: [tool-specific access method and linking approach]
├── Bounded Context: [specific context for implementation]
├── Tech Stack: [adopted technologies and patterns]
├── Task Count: [X tasks identified, story coverage: Y%]
├── Template Used: [task-template.md]
├── Tasks Created: [created: X/Y in tool]
└── Next Action: [specific next step]
```

## Core Principles

### Strategic Task Architecture

- **Verify story refinement FIRST** - story must be refined and ready for breakdown
- **Apply technical standards** - follow [Adoption Guidelines](.pair/adoption/tech) consistently
- **Use bounded context mapping** - each task specifies its implementation domain
- **Size for implementation clarity** - clear guidance without architectural decisions
- **Focus on executable steps** - every task produces demonstrable progress
- **Follow tool integration** - proper hierarchy linking per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
- **Maintain story coverage** - ensure all acceptance criteria addressed by tasks
- **Document with templates** - use [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md)

**CRITICAL**: Before starting task creation:

- **HALT if story not refined** - story must be in 'Refined' state with clear acceptance criteria
- **HALT if tool access unclear** - must understand PM tool hierarchy and linking
- **HALT if bounded context unknown** - verify [Bounded Context Documentation](.pair/adoption/tech/boundedcontext)
- **Do NOT proceed** without clear story context and technical setup

## Implementation Workflow

### Phase 1: Foundation Verification

**Objective**: Verify prerequisites and establish story context for task breakdown.

1. **Verify Tool Configuration**:

   - Check [way-of-working.md](.pair/adoption/tech/way-of-working.md) for PM tool setup
   - Confirm task creation and hierarchy linking methodology (Story → Task)

2. **Handle Missing Configuration**:
   ```
   If no PM tool configured → HALT and request bootstrap completion:
   "Cannot proceed without PM tool configuration. Complete bootstrap first: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)"
   ```

**Foundation Reference**: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)

### Phase 2: Story Selection

**Objective**: Identify and confirm refined story ready for task breakdown.

1. **Apply Story Selection Criteria**:

   - **State**: Must be 'Refined' (not 'Todo' or 'In Progress')
   - **Priority**: Prefer P0 > P1 > P2 within current sprint
   - **Assignment**: Should be unassigned and ready for development
   - **Check Story Completeness**: Verify acceptance criteria and definition of done

2. **Present Story Recommendation**:
   ```
   "I recommend User Story '[STORY_ID]: [STORY_NAME]' (Priority [P0/P1/P2]) for task breakdown.
   This story is refined with [X] acceptance criteria and will deliver [brief story value].
   Should I proceed with breaking down this story into implementation tasks?"
   ```

**Selection Reference**: [User Story Refinement](08-how-to-refine-a-user-story.md)

### Phase 3: Technical Context Analysis

**Objective**: Analyze story requirements against adopted technical standards.

1. **Review Technical Adoption**:

   - **Architecture**: Check [architecture.md](.pair/adoption/tech/architecture.md) for patterns
   - **Tech Stack**: Study [tech-stack.md](.pair/adoption/tech/tech-stack.md) for implementation choices
   - **Infrastructure**: Review [infrastructure.md](.pair/adoption/tech/infrastructure.md) for deployment
   - **UX/UI**: Examine [ux-ui.md](.pair/adoption/tech/ux-ui.md) for interface standards

2. **Identify Bounded Context**:

   - Map story to [Bounded Context](.pair/adoption/tech/boundedcontext) documentation
   - Determine implementation scope and affected modules
   - Identify integration points and dependencies

3. **Present Technical Context**:

   ```
   "Technical analysis complete for '[STORY_ID]'. Implementation will use:
   - Bounded Context: [specific context]
   - Architecture Pattern: [from adoption]
   - Tech Stack: [relevant technologies]
   - Affected Modules: [specific components]

   Ready to proceed with task identification?"
   ```

**Context Reference**: [Bounded Context Guidelines](.pair/knowledge/guidelines/architecture/README.md)

### Phase 4: Task Identification & Decomposition

**Objective**: Break down acceptance criteria into specific implementation tasks.

1. **Map Acceptance Criteria to Tasks**:

   - **UI Tasks**: Components, interactions, visual feedback
   - **Backend Tasks**: Business logic, data processing, APIs
   - **Integration Tasks**: External systems, data synchronization
   - **Testing Tasks**: Unit tests, integration validation

2. **Apply Technical Layer Analysis**:

   - Reference [Code Design Guidelines](.pair/knowledge/guidelines/code-design/README.md)
   - Follow [Testing Strategy](.pair/knowledge/guidelines/testing/test-strategy/README.md)
   - Apply [Security Guidelines](.pair/knowledge/guidelines/quality-assurance/security/README.md)

3. **Present Task Breakdown**:

   ```
   "Task identification complete. Found [X] tasks covering:
   - [Y] UI implementation tasks
   - [Z] backend logic tasks
   - [W] integration tasks
   - [V] testing tasks

   All tasks reference adopted standards and specify bounded context implementation.
   Approved for detailed task definition?"
   ```

**Decomposition Reference**: [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md)

### Phase 5: Task Definition & Technical Specification

**Objective**: Define task scope with clear technical guidance and standard references.

1. **Define Task Scope**:

   - **What**: Specific implementation requirement
   - **Where**: Bounded context and affected modules
   - **How**: Reference to adopted patterns and guidelines
   - **Standards**: Links to relevant technical documentation

2. **Apply Technical Standards**:

   - **Architecture**: Reference [Architecture Guidelines](.pair/knowledge/guidelines/architecture/README.md)
   - **Implementation**: Link [Technical Standards](.pair/knowledge/guidelines/technical-standards/README.md)
   - **Quality**: Apply [Definition of Done](.pair/knowledge/guidelines/quality-assurance/quality-standards/definition-of-done.md)

3. **Handle Non-Standard Solutions**:
   ```
   If implementation requires non-adopted approach:
   "Task [TASK_ID] requires [non-standard approach] not in current adoption.
   Proposed alternative: [solution]. This requires ADR documentation and adoption update.
   Should I proceed with standard approach or propose alternative with ADR?"
   ```

**Standards Reference**: [Guidelines Overview](.pair/knowledge/guidelines/README.md)

### Phase 6: Documentation & Tool Creation

**Objective**: Document tasks using template and append to story body.

1. **Format Task Breakdown Section**:

   Create a task breakdown section with:

   - Checkbox list of all tasks with IDs and titles (for status tracking)
   - Detailed documentation for each task following [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md)

2. **Append to Story Body**:

   Add task breakdown to end of user story body (do not modify existing content):

   - Use checkbox list format: `- [ ] **T-N**: [Task title]`
   - Follow template structure for each task detail section
   - Checkboxes only in task list, not in task details

3. **Template Compliance**:

   - Follow [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md) structure precisely
   - Include: bounded context, technical standards, module specifications
   - Reference specific guideline sections for implementation

**Template Reference**: [Task Template](.pair/knowledge/guidelines/collaboration/templates/task-template.md)

### Phase 7: Coverage Validation & Completion

**Objective**: Validate story coverage and prepare tasks for implementation.

1. **Validate Story Coverage**:

   - All acceptance criteria addressed by tasks
   - Technical standards properly referenced
   - Bounded context implementation specified
   - Dependencies identified and manageable

2. **Update Story Status**:

   ```
   "Task breakdown complete for '[STORY_ID]'. Created [X] tasks covering all acceptance criteria:
   - All tasks specify bounded context and technical approach
   - Implementation guidance references adopted standards
   - Story ready for assignment and sprint execution

   Tasks are ready for implementation phase."
   ```

**Next Phase Reference**: [Task Implementation](10-how-to-implement-a-task.md)

## Quality Assurance

**Essential Checklist**:

- [ ] Story refinement verified and breakdown context established
- [ ] Task identification using acceptance criteria mapping
- [ ] All tasks specify bounded context and affected modules
- [ ] Technical standards properly referenced in each task
- [ ] Task breakdown appended to story body with checkbox list and detailed documentation
- [ ] Template structure followed for each task detail section
- [ ] Story coverage validated - all acceptance criteria addressed
- [ ] Session state maintained throughout process

## Best Practices

### Do's ✅

- **Always verify story refinement first** - story must be refined with clear acceptance criteria
- **Start with highest priority stories** - follow P0 > P1 > P2 within current sprint
- **Apply bounded context mapping consistently** - every task must specify implementation domain
- **Use adopted technical standards religiously** - reference specific guideline sections
- **Maintain clear module scope** - specify exactly which components will be modified
- **Follow task template structure** - use consistent format for all task details
- **Append to story body** - add task breakdown section to end of user story
- **Use checkboxes only for task list** - checkboxes track status, not in detailed documentation
- **Focus on implementation clarity** - provide enough detail to avoid architectural decisions during development
- **Include dependency identification** - capture task dependencies within story
- **Preserve story context throughout** - maintain connection to acceptance criteria and epic objectives
- **Reference technical documentation extensively** - link to specific guideline sections
- **Document non-standard approaches** - create ADRs when deviating from adopted patterns

### Don'ts ❌

- **Never start without story selection** - always propose and confirm story choice based on refinement state
- **Don't create tasks from unrefined stories** - story must be in 'Refined' state
- **Don't ignore bounded context mapping** - every task must specify its implementation domain
- **Don't reinvent technical solutions** - always reference adopted standards and patterns
- **Don't create oversized tasks** - keep tasks focused on single implementation concerns
- **Don't forget technical standards** - every task must reference relevant guidelines
- **Don't skip template structure** - task documentation must follow consistent format
- **Don't modify existing story content** - only append task breakdown section
- **Don't use checkboxes in task details** - checkboxes only in task list for status tracking
- **Don't assume implementation details** - provide clear technical guidance with references
- **Don't treat uncertainty as acceptable** - tasks must have clear implementation path
- **Don't forget module impact** - specify which components will be affected
- **Don't ignore dependency chains** - identify task order and dependencies

## Common Pitfalls & Solutions

| Pitfall                                            | Impact                                                             | Solution                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Starting without story refinement verification** | Incomplete requirements lead to unclear tasks                      | Always verify story is in 'Refined' state before breakdown     |
| **Creating tasks without bounded context**         | Implementation confusion and scope creep                           | Map each task to specific bounded context and affected modules |
| **Ignoring adopted technical standards**           | Inconsistent implementation and technical debt                     | Reference specific guideline sections in every task            |
| **Missing technical specification**                | Developers must make architectural decisions during implementation | Provide clear technical guidance with standard references      |
| **Inconsistent task documentation format**         | Confusion and lost information                                     | Follow template structure consistently for all task details    |
| **Using checkboxes in task details**               | Cluttered documentation and status confusion                       | Checkboxes only in task list at top, not in detailed sections  |
| **Modifying existing story content**               | Lost original story information                                    | Only append task breakdown section, never modify existing text |
| **Over-detailed implementation**                   | Premature optimization and inflexible approach                     | Focus on clear guidance while referencing standards            |
| **Inconsistent module specification**              | Unclear scope leading to regression risks                          | Specify exactly which components will be modified              |
| **Dependency blindness**                           | Development blocking and sprint planning issues                    | Identify task dependencies and implementation order            |
| **Forgetting non-standard solutions**              | Technical debt and inconsistent patterns                           | Document alternatives with ADR requirements when needed        |
| **Poor coverage validation**                       | Missing functionality discovered during development                | Map all acceptance criteria to specific tasks                  |

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- `.pair/adoption/product/PRD.md` - Product vision, user personas, and requirements
- `.pair/adoption/tech/way-of-working.md` - Development methodology and process definitions
- `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` - Project Management Tool Guidelines

**Technical Context:**

- `.pair/adoption/tech/architecture.md` - System architecture patterns and design decisions
- `.pair/adoption/tech/tech-stack.md` - Technology choices and implementation standards
- `.pair/adoption/tech/infrastructure.md` - Infrastructure and deployment requirements
- `.pair/adoption/tech/ux-ui.md` - User interface patterns and interaction guidelines

**Domain Context:**

- `.pair/adoption/product/subdomain/` - Functional boundaries affecting task scope
- `.pair/adoption/tech/boundedcontext/` - Technical boundaries affecting implementation

**Knowledge Base (Complete Technical Guidelines):**

### 🏗️ Architecture & Design

- **[Architecture Guidelines](.pair/knowledge/guidelines/architecture/README.md)** - System architecture patterns, bounded contexts, and ADR processes
- **[Code Design Guidelines](.pair/knowledge/guidelines/code-design/README.md)** - Code organization, design patterns, and implementation standards

### ⚙️ Technical Implementation

- **[Technical Standards](.pair/knowledge/guidelines/technical-standards/README.md)** - Tech stack, development tools, and feature flag management
- **[Infrastructure Guidelines](.pair/knowledge/guidelines/infrastructure/README.md)** - Deployment strategies, environment management, and CI/CD

### 🎨 User Experience & Quality

- **[User Experience Guidelines](.pair/knowledge/guidelines/user-experience/README.md)** - User experience standards and design principles
- **[Definition of Done](.pair/knowledge/guidelines/quality-assurance/quality-standards/definition-of-done.md)** - Quality criteria and completion standards
- **[Testing Strategy](.pair/knowledge/guidelines/testing/test-strategy/README.md)** - Testing frameworks, strategies, and quality gates

### 🔒 Security & Performance

- **[Accessibility Guidelines](.pair/knowledge/guidelines/quality-assurance/accessibility/README.md)** - Accessibility standards and compliance requirements
- **[Performance Guidelines](.pair/knowledge/guidelines/quality-assurance/performance/README.md)** - Performance optimization and monitoring strategies
- **[Security Guidelines](.pair/knowledge/guidelines/quality-assurance/security/README.md)** - Security implementation and best practices
- **[Observability Guidelines](.pair/knowledge/guidelines/observability/README.md)** - Monitoring, logging, and tracing strategies

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
