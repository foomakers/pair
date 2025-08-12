# How to Refine a User Story

## Overview

TBD - This document will describe the process of refining user stories through collaborative analysis, adding necessary details, and ensuring they are ready for development implementation.

## Topics to Cover

- Story refinement process and ceremonies
- Acceptance criteria detailed definition
- Technical analysis and spike identification
- Risk assessment and mitigation
- Definition of done alignment
- Cross-functional team collaboration
- Story readiness validation

## Related Documents

- Previous: [07-how-to-breakdown-user-stories.md](./07-how-to-breakdown-user-stories.md)
- Bootstrap Checklist: [03-how-to-complete-bootstrap-checklist_TBD.md](./03-how-to-complete-bootstrap-checklist_TBD.md)
- Next: [09-how-to-create-tasks_TBD.md](./09-how-to-create-tasks_TBD.md)

# How to Breakdown User Stories - AI-Assisted Guide

## Overview

This guide enables developers and AI assistants to collaboratively decompose Epics into comprehensive User Story breakdowns through a structured, iterative process. User Stories serve as the final executable units that translate epic value into specific, testable, and deliverable functionality within single sprint iterations.

**Key Benefits of Well-Defined User Story Breakdowns:**

- Transform epic value into sprint-sized, deliverable increments
- Enable precise sprint planning and capacity allocation
- Provide clear acceptance criteria for development and testing
- Facilitate continuous integration and deployment practices
- Create immediate user feedback opportunities
- Establish clear development tasks with measurable outcomes

## AI Assistant Role Definition

**Primary Role**: User Story Breakdown Architect

The AI assistant acts as a **User Story Breakdown Architect** who:

- **Analyzes** epic scope to identify atomic user value increments
- **Proposes** user story structure using INVEST principles and vertical slicing
- **Facilitates** collaborative story splitting through pattern-based techniques
- **Documents** user stories with comprehensive templates and acceptance criteria
- **Plans** story dependencies and sprint allocation for optimal development flow
- **Maintains** story documentation consistency within the chosen project management tool

**Working Principles**: Follow the **🤖🤝👨‍💻** model (LLM proposes, Developer validates) throughout the entire process.

## User Story Definition

### What is a User Story?

A **User Story** is a focused piece of work that:

- **Delivers Specific User Value**: Provides concrete functionality that benefits identified user personas
- **Fits Within Single Sprint**: Can be completed within one sprint iteration (typically 1-2 weeks)
- **Follows INVEST Criteria**: Independent, Negotiable, Valuable, Estimable, Small, Testable
- **Enables Vertical Slicing**: Cuts through all application layers to deliver end-to-end functionality
- **Supports Continuous Deployment**: Can be deployed independently without breaking existing functionality
- **Provides Clear Acceptance Criteria**: Includes specific, testable conditions for completion

### User Story vs Other Artifacts

| Artifact       | Duration    | Scope                 | Value Stream     | Purpose                                         |
| -------------- | ----------- | --------------------- | ---------------- | ----------------------------------------------- |
| **Initiative** | 6-8 sprints | Business objective    | Business Value   | Strategic positioning and market advantage      |
| **Epic**       | 2-4 sprints | Feature set           | User Experience  | Incremental value delivery and user journey     |
| **User Story** | 1 sprint    | Single functionality  | Working Software | Specific, testable feature ready for deployment |
| **Task**       | 1-3 days    | Implementation detail | Development Work | Technical implementation step within user story |

## User Story Template Structure

Each user story must follow this comprehensive template:

```markdown
# User Story [Epic-Code]-[Story-Number]: [Story Title]

## Story Statement

**As a** [user persona]
**I want** [functionality or capability]
**So that** [business value or user benefit]

## Epic Context

**Parent Epic**: [Epic Name and Link]
**Epic Objective**: [Brief epic objective reminder]
**Sprint**: [Target sprint number or "TBD"]
**Story Points**: [Estimation or "TBD"]
**Priority**: [High | Medium | Low]

## Business Value

**User Benefit**: [Specific benefit this story delivers to users]
**Business Impact**: [How this story contributes to business objectives]
**User Journey Stage**: [Discovery | Evaluation | Onboarding | Core Usage | Optimization]

## Acceptance Criteria

### Primary Scenarios

- **Given** [context/precondition]
- **When** [user action or event]
- **Then** [expected outcome]
- **And** [additional verification]

- **Given** [another context]
- **When** [different action]
- **Then** [different outcome]

### Edge Cases

- **Given** [edge case context]
- **When** [edge case trigger]
- **Then** [expected handling]

### Non-Functional Requirements

- **Performance**: [Response time, throughput requirements]
- **Security**: [Authentication, authorization, data protection]
- **Accessibility**: [WCAG compliance, screen reader support]
- **Browser/Device**: [Compatibility requirements]

## Definition of Ready

- [ ] Story follows INVEST principles
- [ ] Acceptance criteria are clear and testable
- [ ] Dependencies identified and resolved
- [ ] User persona and value clearly defined
- [ ] Mockups/wireframes available (if UI story)
- [ ] Technical approach discussed and feasible
- [ ] Story sized and estimated
- [ ] No external blockers

## Definition of Done

- [ ] All acceptance criteria met and verified
- [ ] Code written following team standards
- [ ] Unit tests written and passing (minimum 80% coverage)
- [ ] Integration tests passing
- [ ] Code reviewed and approved
- [ ] User interface matches design specifications
- [ ] Accessibility requirements verified
- [ ] Security requirements validated
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Deployed to staging environment
- [ ] User acceptance testing completed
- [ ] Product Owner approval obtained

## Dependencies

**Story Dependencies**: [Other user stories this depends on]
**Technical Dependencies**: [APIs, services, or components needed]
**External Dependencies**: [Third-party integrations or approvals]

## Technical Notes

### Implementation Approach

[High-level technical approach and key considerations]

### Architecture Impact

[Any architectural changes or considerations]

### Database Changes

[Schema changes, migrations, or data considerations]

### API Changes

[New endpoints, modifications, or integrations]

## Testing Strategy

### Unit Testing

[Key units/functions that need testing]

### Integration Testing

[Integration points that need verification]

### User Acceptance Testing

[Specific user scenarios for UAT]

## UI/UX Considerations

### Wireframes/Mockups

[Links to design assets or descriptions]

### User Interactions

[Key interaction patterns and flows]

### Responsive Design

[Mobile, tablet, desktop considerations]

## Notes

[Additional context, assumptions, decisions, or special considerations]
```

## Prerequisites Verification

### Step 0: Epic Readiness Check

**AI Assistant Instructions:** Before beginning user story breakdown, verify epic is ready:

**Required Epic Documentation Check:**

1. **Verify Epic Completion**: Check that the target epic exists and is fully documented with:

   - Complete epic template filled out
   - Clear epic objective and success criteria
   - Defined scope (in-scope and out-of-scope)
   - User story preview completed
   - Epic properly linked to parent initiative

2. **Check Epic Status**: Confirm epic is ready for breakdown:

   - Epic approved and ready for development
   - Dependencies resolved or managed
   - Technical considerations documented
   - Team capacity available for epic execution

3. **Validate Tool Integration**: Verify epic is properly tracked in project management tool with:
   - Correct linking to parent initiative
   - Ready to accept child user story links
   - Status tracking configured

**If Epic Not Ready:**
_"I notice the target epic '[EPIC_NAME]' isn't fully documented or ready for breakdown yet. Before we can create user stories, the epic needs to be completed according to the Epic Breakdown Guide. Please complete the epic documentation first, then return here for user story breakdown."_

**Tool Integration Requirements:**

Before starting user story breakdown, the AI assistant must verify:

**Linking Methodology Verification:**

1. **Check Epic Linking**: Review epic configuration in project management tool for:

   - Parent initiative properly linked
   - Epic ready to receive child user story links
   - Hierarchy structure properly established
   - Tool-specific relationship fields configured

2. **Validate Story Integration**: Confirm the tool supports:
   - Epic-Story linking using defined methodology
   - Story state management (Backlog, In Progress, Review, Done)
   - Sprint assignment and planning integration
   - Progress tracking across story lifecycle

**Linking Setup Questions:**
_"I can see Epic '[EPIC_NAME]' is ready in [TOOL_NAME]. The linking methodology shows [SPECIFIC_METHOD] for connecting epics to user stories. Should I follow this exact approach when creating the story breakdown, or are there any epic-specific adjustments needed for this breakdown?"_

## INVEST Criteria Framework

### INVEST Principles Application

**AI Assistant Instructions:** Every user story must satisfy INVEST criteria:

#### Independent (I)

- **Story can be developed without dependencies on other incomplete stories**
- **Story can be deployed independently**
- **Story provides standalone value**

**Validation Questions:**

- Can this story be completed without waiting for other stories?
- Can this story be deployed and tested independently?
- Does this story provide value on its own?

#### Negotiable (N)

- **Story describes what to build, not how to build it**
- **Story leaves implementation details flexible**
- **Story can be refined through conversation**

**Validation Questions:**

- Does the story focus on user value rather than technical implementation?
- Are there multiple ways to implement this story?
- Can the scope be adjusted based on capacity or priorities?

#### Valuable (V)

- **Story provides clear value to identified user persona**
- **Story contributes meaningfully to epic objective**
- **Story value can be demonstrated to stakeholders**

**Validation Questions:**

- What specific benefit does this story provide to users?
- How does this story advance the epic objective?
- Can we demonstrate this story's value to business stakeholders?

#### Estimable (E)

- **Story scope is clear enough for estimation**
- **Technical approach is understood**
- **Story complexity is reasonable for team experience**

**Validation Questions:**

- Can the team estimate effort required for this story?
- Is the technical approach clear and feasible?
- Are there any major unknowns that prevent estimation?

#### Small (S)

- **Story fits within single sprint**
- **Story can be completed by 1-2 developers**
- **Story doesn't require extensive coordination**

**Validation Questions:**

- Can this story be completed within one sprint?
- Is the scope manageable for a small development team?
- Does this story require extensive cross-team coordination?

#### Testable (T)

- **Story has clear acceptance criteria**
- **Story outcomes can be verified objectively**
- **Story can be demonstrated to product owner**

**Validation Questions:**

- Are the acceptance criteria specific and testable?
- Can we objectively verify when this story is complete?
- Can we demonstrate this story's completion to stakeholders?

## Vertical Slicing Methodology

### Vertical Slice Principles

**AI Assistant Instructions:** Apply vertical slicing to ensure stories cut through all application layers:

#### Full-Stack Implementation

- **User Interface Layer**: Frontend components and user interactions
- **Application Layer**: Business logic and workflow coordination
- **Domain Layer**: Core business rules and domain logic
- **Infrastructure Layer**: Data persistence, external integrations

#### End-to-End Value Delivery

- **User Trigger**: Story starts with user action or need
- **System Processing**: Story includes necessary system processing
- **User Outcome**: Story ends with visible user benefit

#### Deployment Independence

- **Self-Contained**: Story can be deployed without other incomplete stories
- **Non-Breaking**: Story doesn't break existing functionality
- **Testable**: Story can be fully tested in isolation

### Story Splitting Patterns

**AI Assistant Instructions:** Use these patterns to split large stories:

#### 1. Workflow Steps Pattern

Split complex workflows into individual steps:

- **Before**: "As a user, I want to complete the entire onboarding process"
- **After**:
  - "As a user, I want to create my account"
  - "As a user, I want to verify my email"
  - "As a user, I want to set up my profile"

#### 2. CRUD Operations Pattern

Split complex data operations:

- **Before**: "As a user, I want to manage my projects"
- **After**:
  - "As a user, I want to create a new project"
  - "As a user, I want to view my project list"
  - "As a user, I want to edit project details"
  - "As a user, I want to delete a project"

#### 3. Business Rules Pattern

Split by different business rules or variations:

- **Before**: "As a user, I want to calculate shipping costs"
- **After**:
  - "As a user, I want to calculate domestic shipping costs"
  - "As a user, I want to calculate international shipping costs"
  - "As a user, I want to apply shipping discounts"

#### 4. User Roles Pattern

Split by different user types or permissions:

- **Before**: "As a user, I want to manage team members"
- **After**:
  - "As an admin, I want to add team members"
  - "As an admin, I want to remove team members"
  - "As a member, I want to view team member list"

#### 5. Device/Platform Pattern

Split by different platforms or devices:

- **Before**: "As a user, I want to access my dashboard"
- **After**:
  - "As a user, I want to access my dashboard on desktop"
  - "As a user, I want to access my dashboard on mobile"

#### 6. Data Variations Pattern

Split by different data types or complexity:

- **Before**: "As a user, I want to import my data"
- **After**:
  - "As a user, I want to import CSV data"
  - "As a user, I want to import Excel data"
  - "As a user, I want to import data via API"

## Filesystem-Based User Story Management (If Issue Tracker = Filesystem)

> **Note:** Only follow this section if your chosen issue tracker is the filesystem. If you are using a different tool (e.g., Jira, Linear, Trello), ignore this section and follow the tool-specific integration instructions.

### Folder Structure and Naming Conventions

User stories are managed as Markdown files in a flat structure under `.pair/product/backlog/03-user-stories/`, organized by state (backlog, in-progress, review, done). There are no subfolders for epics.

#### 1. User Story State Folders

Create four subfolders under `03-user-stories/` to manage user story states:

- `backlog/` – For user stories not yet started and ready for future sprint planning
- `current-sprint/` – For user stories assigned to the current sprint (in progress, review, testing)
- `done/` – For completed and deployed user stories

**Example:**

```
.pair/product/backlog/03-user-stories/
   ├── backlog/
   ├── current-sprint/
   └── done/
```

#### 2. User Story File Naming

Each user story is a Markdown file inside the appropriate state folder. The filename must include:

- The initiative code (from parent epic)
- The epic code (from parent epic)
- The story code (progressive number for the story within the epic)
- A short, kebab-case name for the story

**Format:**

```
[initiative-code]-[epic-code]-[story-code]-[story-name].md
```

**Example:**

```
.pair/product/backlog/03-user-stories/backlog/01-01-001-user-registration.md
.pair/product/backlog/03-user-stories/backlog/01-01-002-email-verification.md
.pair/product/backlog/03-user-stories/current-sprint/01-02-001-dashboard-overview.md
.pair/product/backlog/03-user-stories/current-sprint/02-01-003-data-export.md
.pair/product/backlog/03-user-stories/done/01-01-001-user-login.md
```

#### 3. Moving User Stories Between States

To update the status of a user story, move its file between the `backlog/`, `current-sprint/`, and `done/` folders as work progresses. The filename and codes remain unchanged to preserve sequencing and traceability.

**State Management:**

- **backlog/**: Stories ready for future sprint planning
- **current-sprint/**: Stories assigned to current sprint (includes in-progress, review, and testing phases)
- **done/**: Stories completed and deployed

#### 4. Linking and Traceability

Each user story file must:

- Use the full user story template provided in this guide
- Include a link to its parent epic (by filename or relative path)
- Include links to any dependent user stories (by filename or relative path)
- All references to markdown documents (e.g., architecture, tech stack) must be markdown links

This ensures clear navigation between initiatives, epics, and user stories in the filesystem.

---

## Step-by-Step Implementation Process

### Step 1: Epic Analysis and Context Review

**AI Assistant Instructions:** Begin by thoroughly analyzing the target epic:

1. **Review Epic Documentation**: Analyze the complete epic to understand:

   - Epic objective and business value
   - Epic scope (in-scope and out-of-scope items)
   - Epic success criteria and acceptance criteria
   - User story preview already identified
   - Technical considerations and constraints

2. **Study Parent Initiative**: Review the parent initiative for:

   - Overall initiative goals and user value
   - User personas and their needs
   - Business constraints and requirements
   - Success metrics and measurement criteria

3. **Analyze Technical Context**:

   - Architecture patterns and constraints
   - Technology stack implications
   - Infrastructure requirements
   - UX/UI guidelines and patterns
   - Domain and bounded context boundaries

4. **Review Foundational Documents**:
   - PRD for product vision and user requirements
   - Way of working for development methodology
   - Technical way of working for implementation standards

**Context Analysis Presentation:**
_"I've analyzed Epic '[EPIC_NAME]' and its context. The epic aims to [epic objective] and will deliver [user value]. Based on the epic's user story preview and scope, I can see opportunities for [X] user stories that will incrementally deliver the epic value. The epic's technical considerations highlight [key technical aspects]. Are you ready to proceed with detailed user story breakdown?"_

### Step 2: User Story Identification and Mapping

**AI Assistant Instructions:** Identify initial user story candidates:

1. **Start with Epic's User Story Preview**: Use the epic's existing user story preview as foundation

2. **Apply User Journey Mapping**:

   - Map user interactions from start to finish
   - Identify decision points and alternative paths
   - Consider error scenarios and edge cases
   - Include user onboarding and setup needs

3. **Apply Vertical Slicing**: Ensure each story cuts through all layers:

   - Frontend user interface
   - Backend business logic
   - Data persistence
   - External integrations

4. **Consider CRUD Operations**: For data-heavy features, identify:

   - Create operations (user input and validation)
   - Read operations (display and search)
   - Update operations (editing and modification)
   - Delete operations (removal and cleanup)

5. **Identify Variations**: Consider different:
   - User roles and permissions
   - Device types and platforms
   - Data types and formats
   - Business rules and scenarios

### Step 3: Story Sizing and INVEST Validation

**AI Assistant Instructions:** Validate stories against INVEST criteria:

1. **Apply INVEST Framework**: For each identified story:

   - **Independent**: Can be developed without dependencies
   - **Negotiable**: Focuses on what, not how
   - **Valuable**: Provides clear user benefit
   - **Estimable**: Scope is clear for estimation
   - **Small**: Fits within single sprint
   - **Testable**: Has clear acceptance criteria

2. **Size Validation**: Ensure stories are appropriately sized:

   - Can be completed by 1-2 developers in one sprint
   - Complexity is manageable for team experience
   - No major unknowns or research required

3. **Split Large Stories**: Apply splitting patterns for oversized stories:
   - Workflow steps pattern
   - CRUD operations pattern
   - Business rules pattern
   - User roles pattern
   - Device/platform pattern
   - Data variations pattern

### Step 4: User Story Breakdown Presentation

**AI Assistant Instructions:** Present comprehensive user story breakdown:

1. **Create Story Overview Table**: Present all identified stories:

| Story     | Title              | User Value               | Dependencies | Complexity |
| --------- | ------------------ | ------------------------ | ------------ | ---------- |
| 01-01-001 | User Registration  | Enable account creation  | None         | Medium     |
| 01-01-002 | Email Verification | Verify account security  | Story 001    | Low        |
| 01-01-003 | Profile Setup      | Complete user onboarding | Story 002    | Medium     |

2. **Justify Story Sequencing**: Explain logical development order:

   - **Foundation Stories First**: Core functionality before enhancements
   - **User Journey Flow**: Stories follow natural user progression
   - **Dependency Resolution**: Dependent stories sequenced appropriately
   - **Risk Management**: Complex stories balanced with simpler ones

3. **Validate Epic Coverage**: Confirm stories fully deliver epic objectives:
   - All epic scope items addressed
   - Epic success criteria achievable
   - Epic acceptance criteria covered
   - No gaps in user value delivery

**Breakdown Presentation:**
_"I've identified [X] user stories for Epic '[EPIC_NAME]'. Each story delivers specific user value and follows INVEST principles. The sequencing prioritizes [key reasoning]. This breakdown covers all epic scope items and enables incremental value delivery. Here's the complete story map - does this align with your development approach?"_

### Step 5: Story Review and Refinement

**AI Assistant Instructions:** Collaborate on story structure refinement:

1. **Gather Feedback** on:

   - Story scope and boundaries
   - User value propositions
   - Sequencing logic
   - Sizing and complexity estimates
   - Missing stories or scenarios

2. **Refine Based on Input**:

   - Adjust story boundaries and scope
   - Split or merge stories as needed
   - Resequence based on dependencies
   - Add missing stories or edge cases

3. **Validate Refined Structure**:
   - Each story follows INVEST principles
   - Stories enable vertical slicing
   - Epic objectives fully achievable
   - Development sequence is logical

**Refinement Questions:**
_"Does the user story breakdown feel complete for delivering the epic value? Should any stories be split differently, combined, or resequenced? Are there any missing user scenarios or edge cases we should address?"_

### Step 6: Individual User Story Documentation

**AI Assistant Instructions:** Document each user story using the complete template:

1. **Present One Story at a Time**: Start with the first story in sequence

2. **Use Complete Template**: Fill all sections thoroughly:

   - Clear story statement with persona, want, and benefit
   - Comprehensive acceptance criteria covering main and edge cases
   - Non-functional requirements
   - Technical considerations and dependencies

3. **Focus on Key Elements**:

   - **User Value**: Clear benefit to specific user persona
   - **Acceptance Criteria**: Specific, testable conditions
   - **Technical Approach**: High-level implementation considerations
   - **Definition of Ready/Done**: Clear completion criteria

4. **Request Specific Feedback**:

   - Story statement clarity and user value
   - Acceptance criteria completeness and testability
   - Technical feasibility and approach
   - Sizing and complexity assessment

5. **Iterate Until Approved**: Refine based on developer feedback

**Story Presentation Format:**
_"Here's the detailed breakdown for User Story [EPIC-STORY]: [NAME]. As a [persona], the user wants [functionality] so that [benefit]. The acceptance criteria cover [main scenarios] with attention to [edge cases]. Technical considerations include [key aspects]. Does this story provide clear value and actionable acceptance criteria?"_

### Step 7: User Story Documentation in Tool

**AI Assistant Instructions:** Create user story records in project management tool:

1. **Follow Tool-Specific Format**: Adapt template to tool requirements while maintaining completeness

2. **Establish Hierarchy Linking**: Create proper linkage:

   - **Parent Link**: Connect user story to its parent epic
   - **Dependency Links**: Connect to prerequisite stories
   - **Tool-Specific Fields**: Follow methodology defined in way-of-working

3. **Configure Story Tracking**: Set up proper tracking:

   - **Sprint Assignment**: Assign to appropriate sprint or backlog
   - **Story Points**: Add estimation if available
   - **Labels/Tags**: Apply relevant categorization
   - **Workflow States**: Configure proper state transitions

4. **Validate Tool Integration**: Confirm:
   - Story properly linked to parent epic
   - Hierarchy relationships established
   - Story visible in epic scope
   - Tracking fields populated correctly

**Tool Documentation Checklist:**

- [ ] User story created with complete template information
- [ ] Properly linked to parent epic using tool-specific methodology
- [ ] Story dependencies configured correctly
- [ ] Hierarchy relationships properly established in tool
- [ ] Sprint assignment configured (or marked as backlog)
- [ ] Estimation and story points added
- [ ] Workflow states and transitions configured
- [ ] All stakeholders have appropriate access

### Step 8: Sprint Planning Readiness

**AI Assistant Instructions:** Prepare stories for sprint planning integration:

1. **Validate Story Readiness**: Confirm all stories meet Definition of Ready:

   - INVEST principles satisfied
   - Acceptance criteria clear and testable
   - Dependencies identified and managed
   - Technical approach feasible
   - Story refinement completed

2. **Prepare for Sprint Planning Process**: Set up stories for **🤖🤝👨‍💻 Sprint Planning**:

   - Stories properly sequenced and prioritized
   - Epic context clearly maintained
   - Dependencies mapped for sprint goal definition
   - Story backlog ready for collaborative sprint goal creation

3. **Integration with Sprint Execution**: Ensure stories are prepared for the **🛠️ Sprint Execution** flow:
   - **👨‍💻💡🤖 Story Kickoff** readiness (branch creation preparation)
   - **🤖🤝👨‍💻 Task Breakdown** preparation (story scope clarity)
   - Clear handoff to sprint execution workflow

**Sprint Planning Readiness:**
_"All [X] user stories for Epic '[EPIC_NAME]' are documented and ready for the collaborative Sprint Planning phase (**🤖🤝👨‍💻 Sprint Planning**). The stories are properly refined and sequenced to support sprint goal definition. Each story is prepared for the sprint execution workflow, starting with **👨‍💻💡🤖 Story Kickoff**. The epic context is maintained to ensure value delivery alignment."_

## Quality Assurance Framework

### User Story Quality Standards

**Content Quality:**

- [ ] Story statement clearly identifies user persona, desired functionality, and business benefit
- [ ] Acceptance criteria cover primary scenarios, edge cases, and non-functional requirements
- [ ] Business value connects directly to user needs and epic objectives
- [ ] Technical approach is feasible within current architecture and tech stack
- [ ] Dependencies are clearly identified and manageable
- [ ] Definition of Ready and Done include all necessary quality gates

**INVEST Compliance:**

- [ ] **Independent**: Story can be developed without waiting for other incomplete stories
- [ ] **Negotiable**: Story focuses on user value, not implementation details
- [ ] **Valuable**: Story provides demonstrable benefit to identified user persona
- [ ] **Estimable**: Story scope is clear enough for development estimation
- [ ] **Small**: Story fits comfortably within single sprint timeline
- [ ] **Testable**: Acceptance criteria are specific, measurable, and verifiable

**Template Completeness:**

- [ ] All required template sections completed thoroughly
- [ ] Story follows naming conventions and tool integration requirements
- [ ] Hierarchy linking properly configured (Epic → User Story)
- [ ] Tool-specific relationship fields populated correctly
- [ ] Sprint assignment and estimation configured appropriately

### Story Breakdown Validation

**Epic Coverage Validation:**

- [ ] **Complete Scope Coverage**: All epic in-scope items addressed by user stories
- [ ] **Success Criteria Alignment**: Epic success criteria achievable through story completion
- [ ] **User Value Continuity**: Story sequence delivers continuous user value
- [ ] **No Gaps**: No missing functionality between epic scope and story breakdown

**Vertical Slicing Validation:**

- [ ] **Full-Stack Implementation**: Each story includes UI, business logic, and data persistence
- [ ] **End-to-End Value**: Each story provides complete user functionality
- [ ] **Deployment Independence**: Each story can be deployed and tested independently
- [ ] **Layer Integration**: Stories properly integrate across application layers

**Sprint Planning Readiness:**

- [ ] **Dependency Management**: Story dependencies clearly mapped and sequenced
- [ ] **Capacity Alignment**: Story sizing appropriate for team capacity and sprint length
- [ ] **Risk Distribution**: High-risk stories balanced with lower-risk stories
- [ ] **Value Distribution**: Each sprint delivers meaningful user value

## Best Practices for AI Assistants

### Do's:

- **Always verify epic readiness** before starting user story breakdown
- **Apply INVEST principles rigorously** to every user story
- **Focus on user personas and specific value** in every story statement
- **Use vertical slicing** to ensure stories deliver end-to-end functionality
- **Create comprehensive acceptance criteria** covering main scenarios and edge cases
- **Consider non-functional requirements** (performance, security, accessibility)
- **Sequence stories logically** following user journey and dependencies
- **Validate against epic objectives** to ensure complete coverage
- **Prepare stories for sprint planning** with proper estimation and prioritization

### Don'ts:

- **Never skip epic context analysis** - understand the full epic scope first
- **Don't create horizontal slice stories** - avoid UI-only or backend-only stories
- **Don't ignore edge cases** - include error handling and boundary conditions
- **Don't assume technical implementation** - focus on user value and behavior
- **Don't create oversized stories** - keep within single sprint boundaries
- **Don't ignore dependencies** between stories and external systems
- **Don't forget non-functional requirements** - include performance, security, accessibility
- **Don't skip tool documentation** - ensure proper project management tool integration
- **Don't ignore user personas** - every story should benefit specific users

## Common Pitfalls and Solutions

| Pitfall                      | Impact                                 | Solution                                                       |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| **Horizontal slice stories** | No deliverable user value              | Apply vertical slicing to include all application layers       |
| **Technical task stories**   | Development focus without user benefit | Reframe as user-facing functionality with clear business value |
| **Oversized stories**        | Sprint commitment risk                 | Apply story splitting patterns to reduce complexity            |
| **Missing edge cases**       | Production issues and user frustration | Include comprehensive acceptance criteria for error scenarios  |
| **Weak acceptance criteria** | Unclear completion definition          | Use specific, testable criteria with concrete examples         |
| **Ignored dependencies**     | Development blocking and rework        | Map all story dependencies and sequence appropriately          |
| **Tool integration gaps**    | Lost tracking and coordination         | Maintain complete documentation with proper hierarchy linking  |
| **Generic user personas**    | Unclear user value targeting           | Use specific personas from PRD and user research               |

## Special Considerations

### 🛠️ Sprint Execution Integration

**When Epic 0 (Application Bootstrap & Setup) exists in the initiative:**

For initiatives requiring new workspace or technical foundation setup, include user stories that track workspace configuration as part of Epic 0. These stories integrate with the **🛠️ Sprint Execution** workflow:

**Example Workspace Setup Stories:**

- "As a developer, I want a configured local development environment so that I can begin feature development efficiently"
- "As a developer, I want database schema and test data so that I can develop against realistic data scenarios"
- "As a developer, I want CI/CD pipeline configured so that I can deploy changes automatically"

These stories ensure workspace setup is tracked through the complete execution workflow:

- **👨‍💻💡🤖 Story Kickoff** (create workspace setup branch)
- **🤖🤝👨‍💻 Task Breakdown** (break down environment setup tasks)
- **🤖⚡ Task Iteration** (autonomous setup completion)
- Full quality assurance and integration workflow

**Documentation Pattern:**

- Include workspace stories in Epic 0 breakdown
- Link workspace stories to feature stories that depend on them
- Estimate workspace setup time as part of project planning
- Track workspace completion through standard **🛠️ Sprint Execution** workflow

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- `.pair/product/adopted/PRD.md` - Product vision, user personas, and requirements
- `.pair/way-of-working.md` - Development methodology and process definitions
- `.pair/product/backlog/02-epics/` - Parent epic documentation requiring story breakdown

**Technical Context:**

- `.pair/tech/adopted/architecture.md` - System architecture patterns affecting story implementation
- `.pair/tech/adopted/tech-stack.md` - Technology constraints and implementation guidelines
- `.pair/tech/adopted/infrastructure.md` - Infrastructure requirements affecting story scope
- `.pair/tech/adopted/ux-ui.md` - User interface patterns and interaction guidelines
- `.pair/tech/adopted/way-of-working.md` - Technical workflow, tool configuration, and linking methodology

**Domain Context:**

- `.pair/product/adopted/subdomain/` - Functional boundaries affecting story scope
- `.pair/tech/adopted/boundedcontext/` - Technical boundaries affecting story integration

**Process Dependencies:**

- **Prerequisites**: Epic must be fully documented and ready before user story breakdown
- **Input**: Epic serves as foundation for user story identification and scope definition
- **Output**: User stories serve as input for **🤖🤝👨‍💻 Sprint Planning** and subsequent **🛠️ Sprint Execution** workflow
- **Tool Integration**: All user stories must be properly documented in configured project management tool with correct hierarchy linking (Epic → User Story → Tasks)
- **Linking Methodology**: Follow the specific linking approach defined in `.pair/tech/adopted/way-of-working.md` for tool-specific relationship management
- **Sprint Execution Integration**: Stories prepared for **👨‍💻💡🤖 Story Kickoff** → **🤖🤝👨‍💻 Task Breakdown** → **🤖⚡ Task Iteration** workflow

**Related Documents:**

- Previous: [06-how-to-breakdown-epics.md](./06-how-to-breakdown-epics.md)
- Next: [08-how-to-refine-a-user-story_TBD.md](./08-how-to-refine-a-user-story_TBD.md)

This guide ensures a thorough, collaborative process that produces high-quality User Story breakdowns ready for sprint planning and successful iterative development.
