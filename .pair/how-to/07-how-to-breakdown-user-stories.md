# How to Breakdown User Stories - AI-Assisted Guide

## Overview

This guide enables developers and AI assistants to collaboratively decompose Epics into User Story breakdowns through a structured, iterative process. User Stories at breakdown stage serve as **rough plannable units** that translate epic value into identifiable work items with **intentional uncertainty** that will be resolved during future refinement.

**Key Benefits of User Story Breakdowns:**

- Transform epic value into identifiable, roughly estimable work increments
- Enable epic-level planning and high-level capacity forecasting
- Provide story placeholders for backlog organization and prioritization
- Facilitate epic progress visibility through story tracking
- Create foundation for detailed refinement when stories are selected for development
- Establish initial story boundaries that can evolve during refinement

**Important: Stories at breakdown stage are intentionally incomplete** - they capture the essential user value and rough scope but deliberately leave implementation details, precise acceptance criteria, and technical specifics for later refinement when the story is selected for development.

## AI Assistant Role Definition

**Primary Role**: User Story Breakdown Architect

The AI assistant acts as a **User Story Breakdown Architect** who:

- **Analyzes** epic scope to identify atomic user value increments
- **Proposes** user story structure using INVEST principles and vertical slicing
- **Facilitates** collaborative story identification through pattern-based techniques
- **Documents** user stories with essential planning information (statement, value, scope, sizing)
- **Plans** story sequencing and epic coverage for optimal development flow
- **Maintains** story documentation consistency within the chosen project management tool

**Working Principles**: Follow the **🤖🤝👨‍💻** model (LLM proposes, Developer validates) throughout the entire process.

## User Story Definition

### What is a User Story (at Breakdown Stage)?

A **User Story at breakdown stage** is a **rough work increment** that:

- **Identifies User Value**: Captures the core functionality that benefits identified user personas
- **Provides Planning Estimate**: Rough sizing for epic-level capacity planning (uncertainty expected)
- **Follows Core INVEST Principles**: Focuses on user value, independence, and estimability at high level
- **Maintains Intentional Ambiguity**: Leaves implementation details and precise requirements for refinement
- **Enables Epic Tracking**: Contributes to epic progress visibility and completion tracking
- **Establishes Initial Boundaries**: Provides starting scope that will be clarified during refinement

**Stories at breakdown stage are intentionally rough** - they capture enough information for backlog management and epic planning while deliberately leaving detailed requirements, acceptance criteria, and technical decisions for later refinement.

### User Story vs Other Artifacts

| Artifact       | Duration    | Scope                | Value Stream     | Purpose                                                |
| -------------- | ----------- | -------------------- | ---------------- | ------------------------------------------------------ |
| **Initiative** | 6-8 sprints | Business objective   | Business Value   | Strategic positioning and market advantage             |
| **Epic**       | 2-4 sprints | Feature set          | User Experience  | Incremental value delivery and user journey            |
| **User Story** | 1 sprint    | Single functionality | Working Software | Rough, estimable feature ready for detailed refinement |

## User Story Breakdown Template

Each user story breakdown must include these essential elements (detailed requirements will be added during refinement):

```markdown
# User Story [Epic-Code]-[Story-Number]: [Story Title]

## Story Statement

**As a** [user persona]
**I want** [general functionality or capability]
**So that** [business value or user benefit]

## Epic Context

**Parent Epic**: [Epic Name and Link]
**Status**: [Backlog]
**Priority**: [High | Medium | Low]

## User Value

**User Benefit**: [High-level benefit this story delivers to users]
**Business Impact**: [How this story contributes to epic and business objectives]
**Visible UI Value**: [Specific UI element, screen, interaction, or feedback that will be demonstrable in sprint review]

## Rough Sizing

**Story Points**: [Initial size estimate: XS(1), S(2), M(3), L(5), XL(8)]
**Confidence**: [High | Medium | Low]
**Reasoning**: [Brief justification for sizing - uncertainty is expected]

## Initial Scope

### Likely In Scope

- [General functionality expected to be included]
- [High-level user interaction patterns]
- [Core system capabilities]
- [UI components and interactions that make value visible]

### Likely Out of Scope

- [Functionality probably excluded]
- [Future story considerations]
- [Related but separate capabilities]

### Open Questions

- [Uncertainties to be resolved during refinement]
- [Implementation details to be decided]
- [Requirements to be clarified]

## Definition of Done Expectations

**Standard DoD Requirements** (to be detailed during refinement):

- [ ] Functionality implemented and working
- [ ] **UI demonstrates the user value** (screen, interaction, feedback, data display)
- [ ] Automated tests written and passing
- [ ] Code reviewed and merged
- [ ] Documentation updated
- [ ] **Demo-ready for sprint review** (clear user story value visible in UI)

## Dependencies

**Story Dependencies**: [Other user stories this likely depends on]
**Epic Dependencies**: [Epic-level dependencies affecting this story]

## Notes

[Brief additional context, assumptions, or planning considerations - uncertainty is expected and normal]
```

**Note: This template captures planning essentials while intentionally leaving detailed acceptance criteria, technical specifications, and precise requirements for later refinement when the story is selected for development.**

## Prerequisites Verification

### Step 0: Documentation Analysis and Epic Selection

**AI Assistant Instructions:** Begin with comprehensive documentation analysis and epic selection:

**Phase 0A: Complete Documentation Analysis**

1. **Study Foundation Documents**: Thoroughly analyze all referenced documentation:

   - **PRD Analysis**: Review product vision, user personas, business requirements, and success metrics
   - **Way of Working**: Understand development methodology, process definitions, and tool integration requirements
   - **Technical Context**: Study architecture patterns, tech stack constraints, UX/UI guidelines, and domain boundaries
   - **Initiative Context**: Review all initiatives, their objectives, priorities, and current status

2. **Analyze Epic Landscape**: Examine all available epics across initiatives:

   - Review epic documentation completeness and readiness
   - Understand epic priorities and business value alignment
   - Identify epic dependencies and sequencing considerations
   - Assess epic scope and complexity for breakdown readiness

3. **Validate Technical Integration**: Confirm tool setup and methodology:
   - Review linking methodology for Epic → User Story relationships
   - Verify project management tool configuration
   - Understand hierarchy establishment requirements

**Phase 0B: Epic Selection and Proposal**

**Mandatory Bootstrap Story Rule**

At any point during the user story breakdown process, if a bootstrap/setup epic (Epic 0) is present, user story breakdown must start from this epic before proceeding to functional epics. If the bootstrap/setup epic is missing, it must be created and its user stories broken down first, before any other user stories are considered. This ensures all technical foundation activities are planned and executed prior to business functionality.

4. **Propose Priority Epic**: Based on documentation analysis, identify and propose highest-priority epic for breakdown:

   _"I've analyzed all available documentation and initiatives. Based on business priorities, user value, and readiness for breakdown, I recommend starting with Epic '[EPIC_NAME]' from Initiative '[INITIATIVE_NAME]'. This epic appears to be the highest priority because [reasoning: business value, user impact, readiness, dependencies, etc.]._

   _Here are the top-priority epics I've identified across all initiatives:_

   | Epic     | Initiative     | Priority Reasoning                    | Readiness Status       |
   | -------- | -------------- | ------------------------------------- | ---------------------- |
   | [Epic 1] | [Initiative A] | [High user value, foundational]       | Ready for breakdown    |
   | [Epic 2] | [Initiative A] | [Critical dependency for other epics] | Ready for breakdown    |
   | [Epic 3] | [Initiative B] | [Strategic business objective]        | Needs minor completion |

   _This is a recommendation based on my analysis - we can proceed with breakdown of any epic from any initiative that you prefer. Which epic would you like to break down into user stories?"_

**Phase 0C: Epic Readiness Verification**

5. **Verify Selected Epic Completion**: Once epic is selected, check that it's fully documented with:

   - Complete epic template filled out
   - Clear epic objective and success criteria
   - Defined scope (in-scope and out-of-scope)
   - User story preview completed
   - Epic properly linked to parent initiative

6. **Check Epic Status**: Confirm epic is ready for breakdown:

   - Epic approved and ready for planning
   - Dependencies identified and documented
   - Technical considerations outlined
   - Epic scope clearly defined

7. **Validate Tool Integration**: Verify epic is properly tracked in project management tool with:
   - Correct linking to parent initiative
   - Ready to accept child user story links
   - Epic metadata properly configured

**If Selected Epic Not Ready:**
_"I notice the selected epic '[EPIC_NAME]' isn't fully documented or ready for breakdown yet. Before we can create user stories, the epic needs to be completed according to the Epic Breakdown Guide. We can either complete the epic documentation first, or select a different epic that's ready for breakdown. Would you prefer to complete this epic or choose another ready epic from the list?"_

## INVEST Criteria Framework

### INVEST Principles Application

**AI Assistant Instructions:** Every user story must satisfy INVEST criteria:

#### Independent (I)

- **Story can be planned without dependencies on other incomplete stories**
- **Story represents standalone planning unit**
- **Story scope is self-contained**

#### Negotiable (N)

- **Story describes what to build, not how to build it**
- **Story scope can be adjusted during refinement**
- **Story leaves implementation details for later refinement**

#### Valuable (V)

- **Story provides clear value to identified user persona**
- **Story contributes meaningfully to epic objective**
- **Story value can be articulated to stakeholders**

#### Estimable (E)

- **Story scope is clear enough for rough estimation**
- **Story complexity is understandable at high level**
- **Major unknowns are identified (to be resolved during refinement)**

#### Small (S)

- **Story scope fits within single sprint**
- **Story represents manageable unit of work**
- **Story doesn't require extensive coordination**

#### Testable (T)

- **Story outcome can be generally verified**
- **Story scope suggests testable completion criteria**
- **Story provides foundation for detailed acceptance criteria (to be defined during refinement)**

## Vertical Slicing Methodology

### Vertical Slice Principles

**AI Assistant Instructions:** Apply vertical slicing to ensure stories represent complete user value:

#### End-to-End User Value

- **User Trigger**: Story starts with user action or need
- **System Response**: Story includes necessary system behavior
- **User Outcome**: Story ends with visible user benefit
- **UI Manifestation**: Story includes the UI component that makes the value visible and demonstrable

#### Planning Completeness

- **Self-Contained**: Story scope is complete for planning purposes
- **Value-Focused**: Story represents meaningful user value increment
- **Estimable**: Story scope enables reasonable effort estimation
- **Demo-Ready**: Story produces something tangible that can be shown in sprint review

#### UI-First Story Cutting Approach

**AI Assistant Instructions:** Every user story must produce visible, demonstrable value in the UI:

**Core Principle**: No story is complete without a UI manifestation that makes its value visible and demonstrable during sprint review.

**Implementation Guidelines**:

- **Technical Work Integration**: Technical components (APIs, data processing, algorithms) must be "carried" into stories through their UI manifestations
- **Visible Feedback**: Include UI elements like status indicators, progress bars, error messages, success notifications
- **Data Visualization**: Technical data processing must result in visible data displays, lists, charts, or reports
- **User Interactions**: Backend functionality must be accessible through buttons, forms, menus, or other UI controls
- **System State Display**: Internal system states must be reflected in UI through status displays, configuration screens, or monitoring dashboards

**Examples of UI-First Story Cutting**:

- ❌ **Wrong**: "Implement data deduplication algorithm"
- ✅ **Right**: "User sees duplicate detection results in data import screen with resolution options"

- ❌ **Wrong**: "Create REST API for broker configuration"
- ✅ **Right**: "User can configure broker settings through UI form and see confirmation of changes"

- ❌ **Wrong**: "Implement error handling for data import"
- ✅ **Right**: "User receives clear error messages and retry options when data import fails"

### Story Splitting Patterns

**AI Assistant Instructions:** Use these patterns to identify appropriate story boundaries:

#### 1. Workflow Steps Pattern

Identify distinct steps in user workflows:

- Account creation → Email verification → Profile setup

#### 2. CRUD Operations Pattern

Identify different data operations:

- Create project → View project → Edit project → Delete project

#### 3. Business Rules Pattern

Identify different business scenarios:

- Standard shipping → Express shipping → International shipping

#### 4. User Roles Pattern

Identify different user types:

- Admin actions → Member actions → Guest actions

#### 5. Device/Platform Pattern

Identify different platforms:

- Desktop experience → Mobile experience

#### 6. Data Variations Pattern

Identify different data types:

- Text data → Image data → File attachments

## Filesystem-Based User Story Management (If Issue Tracker = Filesystem)

> **Note:** Only follow this section if your chosen issue tracker is the filesystem. If you are using a different tool (e.g., Jira, Linear, Trello), ignore this section and follow the tool-specific integration instructions.

### Folder Structure and Naming Conventions

User stories are managed as Markdown files in the `backlog/` subfolder under `.pair/product/backlog/03-user-stories/` during the breakdown phase.

#### User Story File Naming

Each user story is a Markdown file in the `backlog/` folder. The filename must include:

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
.pair/product/backlog/03-user-stories/backlog/01-02-001-dashboard-overview.md
```

#### Linking and Traceability

Each user story file must:

- Use the breakdown template provided in this guide
- Include a link to its parent epic (by filename or relative path)
- All references to markdown documents must be markdown links

This ensures clear navigation between epics and user stories in the filesystem.

---

## Step-by-Step Implementation Process

### Step 1: Selected Epic Analysis and Context Review

**AI Assistant Instructions:** With the selected epic confirmed, proceed with detailed analysis:

1. **Review Selected Epic Documentation**: Analyze the chosen epic to understand:

   - Epic objective and business value
   - Epic scope (in-scope and out-of-scope items)
   - Epic success criteria
   - User story preview already identified
   - Technical considerations and constraints

2. **Study Parent Initiative Context**: Review the parent initiative for:

   - Overall initiative goals and user value
   - User personas and their needs
   - Business constraints and requirements
   - Success metrics and measurement criteria

3. **Analyze Technical Context**:
   - Architecture patterns and constraints
   - Technology stack implications
   - UX/UI guidelines and patterns
   - Domain and bounded context boundaries

**Context Analysis Presentation:**
_"I've completed the analysis of selected Epic '[EPIC_NAME]' and its context. The epic aims to [epic objective] and will deliver [user value]. Based on the epic's user story preview and scope, I can see opportunities for [X] user stories that will incrementally deliver the epic value. Are you ready to proceed with user story identification and breakdown?"_

### Step 2: User Story Identification and Mapping

**AI Assistant Instructions:** Identify user story candidates:

1. **Start with Epic's User Story Preview**: Use the epic's existing user story preview as foundation

2. **Apply User Journey Mapping**:

   - Map user interactions from start to finish
   - Identify decision points and alternative paths
   - Consider key user scenarios and workflows

3. **Apply Vertical Slicing**: Ensure each story represents complete user value:

   - End-to-end user interaction
   - Meaningful user outcome
   - Self-contained value delivery

4. **Consider CRUD Operations**: For data-heavy features, identify:

   - Create operations (user input and setup)
   - Read operations (display and access)
   - Update operations (editing and changes)
   - Delete operations (removal and cleanup)

5. **Identify Key Variations**: Consider different:
   - User roles and permissions
   - Business scenarios and rules
   - Data types and formats
   - Platform requirements

### Step 3: Story Scope Definition and INVEST Validation

**AI Assistant Instructions:** Define story boundaries and validate against INVEST criteria:

1. **Define Story Scope**: For each identified story:

   - Clear in-scope functionality
   - Explicit out-of-scope exclusions
   - Story boundaries that enable independent planning

2. **Apply INVEST Framework**: Validate each story:

   - **Independent**: Can be planned separately
   - **Negotiable**: Focuses on user value
   - **Valuable**: Provides clear user benefit
   - **Estimable**: Scope is clear for sizing
   - **Small**: Fits within single sprint
   - **Testable**: Outcome can be verified

3. **Apply UI-First Story Cutting**: Ensure each story produces demonstrable UI value:

   - **Visible User Value**: Every story must produce something visible and demonstrable in the UI during sprint review
   - **End-to-End Slicing**: Stories include both backend functionality AND UI manifestation of that functionality
   - **Demo-Ready Increments**: Each story completion enables a concrete demonstration to stakeholders
   - **Technical Work Integration**: Technical components (APIs, data processing, etc.) are "carried" into UI through visible effects like feedback messages, data displays, status indicators, or user interactions

4. **Size Stories**: Provide initial sizing with expected uncertainty:
   - XS (1 point): Simple, well-understood work
   - S (2 points): Straightforward with minor complexity
   - M (3 points): Moderate complexity, standard effort
   - L (5 points): Complex work, significant effort
   - XL (8 points): Very complex, likely needs splitting during refinement

**Note: Sizing at breakdown stage is intentionally rough - detailed estimation occurs during story refinement.**

### Step 4: User Story Breakdown Presentation

**AI Assistant Instructions:** Present comprehensive user story breakdown:

1. **Create Story Overview Table**: Present all identified stories:

| Story     | Title              | User Value               | Dependencies | Size | Confidence |
| --------- | ------------------ | ------------------------ | ------------ | ---- | ---------- |
| 01-01-001 | User Registration  | Enable account creation  | None         | M(3) | Medium     |
| 01-01-002 | Email Verification | Verify account security  | Story 001    | S(2) | High       |
| 01-01-003 | Profile Setup      | Complete user onboarding | Story 002    | M(3) | Low        |

2. **Justify Story Boundaries**: Explain story scope decisions:

   - **Value Focus**: Each story targets identifiable user value
   - **Initial Boundaries**: Rough scope boundaries for backlog organization
   - **Planning Utility**: Stories provide sufficient information for epic-level planning
   - **Refinement Readiness**: Stories prepared for future detailed elaboration

3. **Validate Epic Coverage**: Confirm stories address epic scope:
   - All epic in-scope items covered by stories
   - Epic objectives achievable through story completion
   - No gaps in epic value delivery

**Breakdown Presentation:**
_"I've identified [X] user stories for Epic '[EPIC_NAME]'. Each story targets specific user value with initial scope boundaries and ensures visible, demonstrable UI value for sprint reviews. The breakdown covers all epic scope areas and provides rough planning units for backlog management. Every story produces something concrete that can be shown to stakeholders - whether it's a new screen, user interaction, data display, or feedback mechanism. Uncertainty and open questions are expected at this stage - these will be resolved during story refinement. Here's the initial story breakdown - does this capture the right level of granularity for epic planning and demonstrate clear user value through the UI?"_

**Example Story Breakdown Table with UI Value:**

| Story     | Title                      | Visible UI Value                                    | Dependencies | Size | Confidence |
| --------- | -------------------------- | --------------------------------------------------- | ------------ | ---- | ---------- |
| 01-01-001 | Broker Management Screen   | User sees list of adapters with status indicators   | None         | M(3) | Medium     |
| 01-01-002 | Add/Remove Adapters via UI | User can click buttons to add/remove with feedback  | Story 001    | S(2) | High       |
| 01-01-003 | Integration Logs Display   | User views operation logs in dedicated UI section   | Story 001    | S(2) | Medium     |
| 01-01-004 | Manual Data Import Trigger | User clicks import button and sees progress status  | 001,002      | M(3) | Medium     |
| 01-01-005 | Real-time Data Display     | User sees imported data updated in UI with feedback | Story 004    | M(3) | Medium     |

### Step 5: Story Review and Refinement

**AI Assistant Instructions:** Collaborate on story structure refinement:

1. **Gather Feedback** on:

   - Story scope and boundaries
   - User value propositions
   - Story sizing and complexity
   - Epic coverage completeness

2. **Refine Based on Input**:

   - Adjust story boundaries and scope
   - Split or merge stories as needed
   - Update sizing estimates
   - Add missing stories for epic coverage

3. **Validate Refined Structure**:
   - Each story follows INVEST principles
   - Stories provide clear planning units
   - Epic objectives fully covered
   - Story boundaries enable independent planning

**Refinement Questions:**
_"Does the user story breakdown provide clear planning units for the epic? Should any stories be scoped differently or sized differently? Are there any missing user scenarios we should include to achieve complete epic coverage?"_

### Step 6: User Story Documentation

**AI Assistant Instructions:** Document each user story using the breakdown template:

1. **Present Stories Systematically**: Document stories in logical sequence

2. **Use Breakdown Template**: Fill essential sections:

   - Clear story statement with persona, functionality, and benefit
   - User value and business impact
   - Scope definition (in-scope and out-of-scope)
   - Initial sizing with reasoning
   - Dependencies and epic context

3. **Focus on Planning Elements**:

   - **Story Statement**: Clear user-focused description
   - **User Value**: High-level benefit articulation
   - **Initial Scope**: Rough boundaries with identified uncertainties
   - **Rough Sizing**: Estimation for capacity planning with confidence level

4. **Request Planning Feedback**:
   - Story statement clarity and user value identification
   - Initial scope boundaries and uncertainty areas
   - Sizing reasonableness for planning purposes
   - Epic coverage and missing areas

**Story Documentation Format:**
_"Here's the breakdown documentation for User Story [EPIC-STORY]: [NAME]. As a [persona], the user wants [general functionality] to achieve [benefit]. The initial scope likely includes [rough in-scope items] and excludes [rough out-of-scope items], with open questions about [uncertainty areas]. I've sized this as [size] with [confidence level] because [reasoning]. Does this provide sufficient information for backlog planning while acknowledging the expected uncertainties?"_

### Step 7: User Story Documentation in Tool

**AI Assistant Instructions:** Create user story records in project management tool:

1. **Follow Tool-Specific Format**: Adapt breakdown template to tool requirements

2. **Establish Hierarchy Linking**: Create proper linkage:

   - **Parent Link**: Connect user story to its parent epic
   - **Dependency Links**: Connect to prerequisite stories if any
   - **Tool-Specific Fields**: Follow methodology defined in way-of-working

3. **Configure Basic Tracking**: Set up essential tracking:

   - **Status**: Set to "Backlog"
   - **Story Points**: Add sizing estimation
   - **Labels/Tags**: Apply relevant categorization
   - **Basic Metadata**: Epic context and priority

4. **Validate Tool Integration**: Confirm:
   - Story properly linked to parent epic
   - Hierarchy relationships established
   - Story visible in epic scope
   - Basic tracking fields populated

**Tool Documentation Checklist:**

- [ ] User story created with breakdown template information
- [ ] Properly linked to parent epic using tool-specific methodology
- [ ] Story dependencies configured if any exist
- [ ] Hierarchy relationships properly established in tool
- [ ] Status set to "Backlog"
- [ ] Story points and sizing added
- [ ] Basic metadata and categorization configured
- [ ] Epic coverage visible and trackable

### Step 8: Epic Coverage Validation

**AI Assistant Instructions:** Validate complete epic coverage:

1. **Verify Epic Coverage**: Confirm breakdown completeness:

   - All epic in-scope items addressed by user stories
   - Epic success criteria achievable through story completion
   - Epic objectives fully covered by story value
   - No gaps in user value delivery

2. **Validate Planning Readiness**: Ensure stories are ready for backlog management:

   - All stories properly documented
   - Story sizing completed for capacity planning
   - Story dependencies identified and documented
   - Story backlog ready for prioritization

3. **Prepare for Future Refinement**: Set up stories for detailed refinement:
   - Stories in backlog status ready for selection and detailed elaboration
   - Story context preserved for comprehensive refinement process
   - Epic relationship maintained for value alignment
   - Open questions and uncertainties documented for refinement resolution

**Epic Coverage Validation:**
_"All [X] user stories for Epic '[EPIC_NAME]' are documented and provide initial epic coverage. The breakdown addresses major epic scope areas with intentional uncertainty that will be resolved during story refinement. Each story is roughly sized and ready for backlog prioritization. The epic is now ready for ongoing backlog management, and individual stories are prepared for detailed refinement when selected for development."_

## Quality Assurance Framework

### User Story Breakdown Quality Standards

**Content Quality:**

- [ ] Story statement identifies user persona, general functionality, and business benefit
- [ ] User value connects to user needs and epic objectives at high level
- [ ] Initial scope provides rough boundaries with identified uncertainties
- [ ] Story sizing is reasonable for planning purposes with confidence level indicated
- [ ] Dependencies are identified at high level
- [ ] Epic context is preserved and linked
- [ ] Open questions and uncertainties are documented for future refinement

**INVEST Compliance:**

- [ ] **Independent**: Story can be planned without waiting for other incomplete stories
- [ ] **Negotiable**: Story focuses on user value, not implementation details
- [ ] **Valuable**: Story provides demonstrable benefit to identified user persona
- [ ] **Estimable**: Story scope is clear enough for rough planning-level estimation
- [ ] **Small**: Story represents manageable planning unit (detailed sizing during refinement)
- [ ] **Testable**: Story outcome can be generally verified (detailed criteria during refinement)

**Template Completeness:**

- [ ] All required breakdown template sections completed
- [ ] Story follows naming conventions and tool integration requirements
- [ ] Hierarchy linking properly configured (Epic → User Story)
- [ ] Tool-specific relationship fields populated correctly
- [ ] Story backlog status properly configured

### Epic Coverage Validation

**Coverage Completeness:**

- [ ] **Initial Scope Coverage**: Major epic scope areas addressed by user stories
- [ ] **Value Alignment**: Epic objectives achievable through story completion
- [ ] **Value Continuity**: Stories collectively target epic user value
- [ ] **Acceptable Gaps**: Minor uncertainties and open questions documented for refinement

**Planning Readiness:**

- [ ] **Initial Boundaries**: Rough scope boundaries for backlog organization
- [ ] **Dependency Awareness**: High-level story dependencies identified
- [ ] **Rough Sizing**: Story sizing appropriate for epic-level capacity planning
- [ ] **Backlog Integration**: Stories ready for prioritization with expected uncertainty

## Best Practices for AI Assistants

### Do's:

- **Always analyze complete documentation first** before proposing epic selection
- **Propose priority epics with clear reasoning** based on business value and readiness
- **Apply INVEST principles consistently** to every user story
- **Focus on user personas and specific value** in every story statement
- **Use vertical slicing** to ensure stories represent identifiable user value
- **Apply UI-First story cutting** - every story must produce visible, demonstrable UI value
- **Ensure stories are demo-ready** - each increment should be showable in sprint review
- **Integrate technical work into UI manifestations** - carry backend functionality through visible UI elements
- **Define initial scope boundaries** with acknowledged uncertainty
- **Size stories roughly** with confidence levels for capacity planning
- **Document open questions** and areas needing refinement
- **Maintain epic context and linkage** throughout breakdown process
- **Prepare stories for backlog management** with planning-level information
- **Acknowledge uncertainty as normal** - detailed requirements come during refinement
- **Include "Visible UI Value" in every story** to ensure demonstrability

### Don'ts:

- **Never analyze complete documentation first** before proposing epic selection
- **Don't start without epic selection** - always propose priority options
- **Don't create horizontal slice stories** - avoid technical-only or UI-only stories
- **Don't create stories without visible UI value** - every story must be demonstrable
- **Don't separate technical work from UI manifestation** - integrate backend functionality with UI display
- **Don't over-specify scope boundaries** - maintain appropriate uncertainty for breakdown stage
- **Don't assume detailed requirements** - focus on high-level user value and rough scope
- **Don't create oversized stories** - keep within rough single sprint boundaries
- **Don't ignore epic coverage** - ensure major epic scope areas are addressed
- **Don't skip tool documentation** - ensure proper project management tool integration
- **Don't forget user personas** - every story should benefit specific users from PRD
- **Don't treat uncertainty as failure** - ambiguity is expected and will be resolved during refinement
- **Don't create "technical debt" or "infrastructure" stories** without clear UI value demonstration

## Common Pitfalls and Solutions

| Pitfall                               | Impact                                  | Solution                                                           |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| **Skipping documentation analysis**   | Missing context and poor prioritization | Thoroughly analyze all foundation docs before epic selection       |
| **Horizontal slice stories**          | No identifiable user value              | Apply vertical slicing to represent end-to-end user value          |
| **Stories without visible UI value**  | Non-demonstrable increments             | Apply UI-First cutting - every story must show visible value in UI |
| **Separating technical work from UI** | Backend stories with no demo value      | Integrate technical functionality with UI manifestations           |
| **Over-detailed breakdown**           | Premature requirement specification     | Focus on high-level user value, leave details for refinement       |
| **Unclear initial boundaries**        | Planning difficulty                     | Provide rough scope boundaries with documented uncertainties       |
| **Inconsistent rough sizing**         | Capacity planning issues                | Apply consistent sizing criteria with confidence levels            |
| **Missing epic coverage**             | Incomplete value targeting              | Validate major epic scope areas are addressed by stories           |
| **Weak story statements**             | Unclear user value identification       | Use clear persona, general functionality, and benefit structure    |
| **Tool integration gaps**             | Lost tracking and coordination          | Maintain complete documentation with proper hierarchy linking      |
| **Treating uncertainty as failure**   | Over-specification at wrong stage       | Acknowledge and document uncertainties for refinement resolution   |
| **Starting without epic selection**   | Working on wrong priorities             | Always propose and confirm epic selection based on analysis        |
| **Creating non-demonstrable stories** | Unusable sprint review increments       | Ensure every story produces something showable to stakeholders     |

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- `.pair/product/adopted/PRD.md` - Product vision, user personas, and requirements
- `.pair/way-of-working.md` - Development methodology and process definitions
- `.pair/product/backlog/01-initiatives/` - All initiative documentation for context and priority analysis
- `.pair/product/backlog/02-epics/` - All epic documentation requiring story breakdown

**Technical Context:**

- `.pair/tech/adopted/architecture.md` - System architecture patterns affecting story scope
- `.pair/tech/adopted/tech-stack.md` - Technology constraints and implementation considerations
- `.pair/tech/adopted/ux-ui.md` - User interface patterns and interaction guidelines
- `.pair/tech/adopted/way-of-working.md` - Technical workflow, tool configuration, and linking methodology

**Domain Context:**

- `.pair/product/adopted/subdomain/` - Functional boundaries affecting story scope
- `.pair/tech/adopted/boundedcontext/` - Technical boundaries affecting story integration

**Process Dependencies:**

- **Prerequisites**: Complete documentation analysis and epic selection before user story breakdown
- **Input**: Selected epic serves as foundation for user story identification and scope definition
- **Output**: User stories in backlog status ready for prioritization and future refinement
- **Tool Integration**: All user stories must be properly documented in configured project management tool with correct hierarchy linking (Epic → User Story)
- **Linking Methodology**: Follow the specific linking approach defined in `.pair/tech/adopted/way-of-working.md` for tool-specific relationship management
- **Next Phase**: Stories ready for **How to Refine User Stories** process when selected for development

**Related Documents:**

- Previous: [06-how-to-breakdown-epics.md](./06-how-to-breakdown-epics.md)
- Next: [08-how-to-refine-a-user-story.md](./08-how-to-refine-a-user-story.md)

This guide ensures a focused, efficient process that produces high-quality User Story breakdowns ready for backlog management and future detailed refinement.
