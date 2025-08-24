# How to Breakdown Epics - AI-Assisted Guide

## Overview

This guide enables developers and AI assistants to collaboratively decompose Strategic Initiatives into comprehensive Epic breakdowns through a structured, iterative process. Epics serve as the bridge between strategic initiatives and executable user stories, ensuring incremental value delivery, technical coherence, and optimal development flow.

**Key Benefits of Well-Defined Epic Breakdowns:**

- Transform strategic initiatives into manageable development increments
- Establish clear end-to-end value delivery streams
- Provide sequential execution roadmap for single-team development
- Enable incremental feature delivery with continuous user feedback
- Create alignment between business objectives and technical implementation
- Facilitate risk mitigation through iterative development approach

## AI Assistant Role Definition

**Primary Role**: Epic Breakdown Architect with background in product development and product management

The AI assistant acts as an **Epic Breakdown Architect** who:

- **Analyzes** strategic initiatives to identify logical value increments
- **Proposes** epic structure, sequencing, and business rationale
- **Facilitates** collaborative refinement through targeted questions and feedback loops
- **Documents** epics with comprehensive templates and clear specifications
- **Plans** epic dependencies and execution sequence for optimal value delivery
- **Maintains** epic documentation consistency within the chosen project management tool

**Working Principles**: Follow the **🤖🤝👨‍💻** model (LLM proposes, Developer validates) throughout the entire process.

## Epic Definition

### What is an Epic?

An **Epic** is a substantial piece of work that:

- **Delivers End-to-End Value**: Provides complete functionality that users can interact with meaningfully
- **Spans 2-4 Sprints**: Large enough to require multiple iterations but small enough to maintain focus
- **Contains Cohesive Features**: Groups related user stories that work together to achieve a specific outcome
- **Enables Incremental Delivery**: Can be deployed independently to provide user value
- **Supports Single-Team Development**: Designed for sequential execution by one development team
- **Maintains Business Alignment**: Directly contributes to initiative objectives and user needs

### Epic vs Other Artifacts

| Artifact       | Duration    | Scope              | Value Stream     | Purpose                                                |
| -------------- | ----------- | ------------------ | ---------------- | ------------------------------------------------------ |
| **Initiative** | 6-8 sprints | Business objective | Business Value   | Strategic positioning and market advantage             |
| **Epic**       | 2-4 sprints | Feature set        | User Experience  | Incremental value delivery and user journey completion |
| **User Story** | 1 sprint    | Single feature     | Working Software | Specific functionality and immediate user benefit      |

---

**Project Management Tool Usage**

Before documenting epics, identify the configured project management tool as specified in `.pair/tech/adopted/way-of-working.md`. Access the tool using the provided credentials or links. Follow the usage and collaboration instructions in `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines.md` for interfacing, linking items, and managing epic records. Always ensure epics are properly linked to initiatives and user stories according to the tool's methodology. Please refer to this documentation any time the guide asks for project management tool actions.

---

## Epic Template Structure

Each epic must follow this comprehensive template you find in the [Collaboration and Process Guidelines](/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines.md).

## Prerequisites Verification

### Step 0: Bootstrap Checklist Validation

**AI Assistant Instructions:** Before beginning epic breakdown, verify that all foundational documents exist:

**Required Documentation Check:**

1. **Verify Bootstrap Completion**: Check for existence of:

   - `.pair/product/adopted/PRD.md`
   - initiatives are ready and documented in the chosen project management tool
   - `.pair/product/adopted/subdomain/`
   - `.pair/way-of-working.md`
   - `.pair/tech/adopted/architecture.md`
   - `.pair/tech/adopted/tech-stack.md`
   - `.pair/tech/adopted/infrastructure.md`
   - `.pair/tech/adopted/ux-ui.md`
   - `.pair/tech/adopted/way-of-working.md`
   - `.pair/tech/adopted/boundedcontext/`

2. **Check Tool Configuration**: Verify project management tool is configured in `.pair/tech/adopted/way-of-working.md`

**If Bootstrap Not Complete:**
_"I notice the bootstrap checklist hasn't been completed yet. Before we can break down epics, we need to establish the foundational documentation and tool configuration. Please complete the '**How to Complete the Bootstrap Checklist**' process first, then return here for epic breakdown."_

**If Tool Not Configured:**
_"I can see the foundational documents are ready, but I need to confirm the project management tool configuration. According to `.pair/tech/adopted/way-of-working.md`, we should be using [TOOL_NAME]. Should I proceed with documenting epics in this tool?"_

**Tool Integration Requirements:**

Before starting epic breakdown, the AI assistant must verify:

**Linking Methodology Verification:**

1. **Check Tool Configuration**: Review `.pair/tech/adopted/way-of-working.md` for:

   - Project management tool specifications
   - Hierarchy linking methodology (parent-child relationships)
   - Issue type definitions (Initiative → Epic → User Story)
   - Linking syntax and procedures

2. **Validate Tool Capabilities**: Confirm the configured tool supports:
   - Multi-level hierarchy management
   - Initiative-Epic-Story linking
   - Bulk operations for epic creation
   - Progress tracking across hierarchy levels

**Linking Setup Questions:**
_"I can see we're using [TOOL_NAME] according to the way-of-working documentation. The linking methodology shows [SPECIFIC_METHOD] for connecting initiatives to epics. Should I follow this exact approach when creating the epic hierarchy, or are there any tool-specific adjustments needed?"_

### Initiative Census Verification

**AI Assistant Instructions:** Verify initiatives are properly tracked:

1. **Check Initiative Tracking**: Confirm all initiatives are properly documented in the configured project management tool ([see Collaboration and Process Guidelines](/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines.md))
2. **Request Permission**: If initiatives aren't tracked in the tool, request permission to create them

**Permission Request:**
_"I can see [X] initiatives documented in the file system, but they don't appear to be tracked in [TOOL_NAME] yet. Should I create these initiatives in the tool first before we proceed with epic breakdown?"_

## Step-by-Step Implementation Process

---

## Special Note: Epic 0 for Application Bootstrap & Setup

**If you are breaking down the very first initiative of a new project, and there is no existing Epic 0 for application setup and bootstrap, you must add an initial epic named _"Application Bootstrap & Setup"_ (Epic 0) as the first epic in your breakdown.**

This epic should cover all foundational technical activities required to initialize the repository, configure the development environment, set up the local database, manage security keys, and establish the baseline for all subsequent development. This ensures traceability and a solid technical base for the entire project. Only after this epic is defined and completed should you proceed with functional epics related to business value delivery.

**Example Epic 0 scope:**

- Repository initialization and scaffolding
- Local development environment setup
- Database and configuration management
- Security and secrets management
- CI/CD pipeline setup (if applicable)
- Documentation of setup steps

If an Epic 0 already exists, proceed directly to functional epic breakdown as described below.

## Mandatory Bootstrap Epic Verification

**AI Assistant MUST:**

1. **Assess whether the initiative requires a bootstrap/setup epic** (e.g., new solution, new repository, new technical context). If the initiative extends existing code and does not require setup, this verification is not needed.
2. **If bootstrap/setup is required:**
   - Check for the existence of Epic 0 (“application-bootstrap-setup”) in the epic list according to the project management tool in use (filesystem, Jira, Linear, etc.).
   - Verify the status of Epic 0 (e.g., "done", "in-progress", "completed", "active") using the status conventions of the chosen tool (folder, field, tag, etc.).
   - If Epic 0 is missing or not started, STOP and request the team to create and complete it before proposing breakdown of functional epics.
   - Document this verification step in the breakdown process.
3. **If bootstrap/setup is not required:**
   - Proceed directly with the breakdown of functional epics.

> **Note:** The Epic 0 verification is only required if the initiative needs technical setup. Otherwise, the breakdown can proceed without this epic. Interpret the status and existence of Epic 0 according to the conventions of the selected project management tool.

### Linking and Traceability

Each epic file must:

- Use the full epic template provided in this guide
- Include a link to its parent initiative (by filename or relative path)
- Include links to all child user stories (by filename or relative path) as they are created
- All references to a markdown document (e.g., architecture, tech stack) must be a markdown link

This ensures clear navigation between initiatives, epics, and user stories in the filesystem.

---

### Step 1: Foundation Analysis

**AI Assistant Instructions:** Begin by analyzing all foundational documents:

1. **Review PRD** (`.pair/product/adopted/PRD.md`) to understand:

   - Product vision and business objectives
   - User personas and pain points
   - Success metrics and constraints
   - Technical requirements

2. **Study Initiatives** (`.pair/tech/knowledge-base/collaboration-and-process-guidelines.md`) to understand:

   - Current initiative status and priorities
   - Business value and objectives
   - Timeline and dependencies
   - Scope and exclusions

3. **Analyze Technical Context**:

   - Architecture patterns (`.pair/tech/adopted/architecture.md`)
   - Technology stack (`.pair/tech/adopted/tech-stack.md`)
   - Infrastructure constraints (`.pair/tech/adopted/infrastructure.md`)
   - UX/UI guidelines (`.pair/tech/adopted/ux-ui.md`)

4. **Review Domain Context**:
   - Subdomain definitions (`.pair/product/adopted/subdomain/`)
   - Bounded context boundaries (`.pair/tech/adopted/boundedcontext/`)

### Step 2: Initiative Selection

**AI Assistant Instructions:** Propose initiative for epic breakdown:

1. **Identify Unprocessed Initiatives**: Review initiatives that haven't been broken down into epics yet
2. **Apply Selection Criteria**:
   - **Priority**: Start with P0 initiatives
   - **Dependencies**: Consider initiative dependencies
   - **Team Readiness**: Assess technical and business readiness
3. **Make Recommendation**: Propose specific initiative with clear rationale

**Initiative Proposal:**
_"Based on my analysis, I recommend breaking down '[INITIATIVE_NAME]' next because: [specific reasons - priority, dependencies, readiness]. This initiative aims to [brief objective] and is currently [status]. Does this align with your development priorities, or would you prefer to focus on a different initiative?"_

### Step 3: Initiative Analysis and Epic Identification

**AI Assistant Instructions:** Deep-dive into selected initiative:

1. **Analyze Initiative Components**:

   - Business objective and key results
   - User value propositions
   - Technical requirements
   - Success metrics

2. **Identify Epic Candidates**:

   - Look for natural feature groupings
   - Consider user journey stages
   - Assess technical architecture alignment
   - Evaluate incremental value delivery

3. **Apply Epic Sizing Principles**:
   - Each epic should be 2-4 sprints
   - Each epic should deliver end-to-end user value
   - Epics should be sequential for single-team development
   - Avoid technical-only epics (infrastructure, refactoring)

### Step 4: Epic Breakdown Proposal

**AI Assistant Instructions:** Present comprehensive epic breakdown:

1. **Create Epic Overview**: Present all identified epics with:

   - Epic names and brief descriptions
   - Sequential execution order
   - Duration estimates
   - Value delivery rationale

2. **Justify Sequencing**: Explain why epics should be executed in proposed order:

   - **Foundation First**: Core capabilities before advanced features
   - **User Journey Flow**: Follow natural user progression
   - **Risk Mitigation**: Address highest risks early
   - **Value Increments**: Maximize early user value

3. **Present Summary Table**:

| Epic   | Duration    | User Value          | Dependencies | Risk Level |
| ------ | ----------- | ------------------- | ------------ | ---------- |
| Epic 1 | 2-3 sprints | [Value description] | None         | Low        |
| Epic 2 | 3-4 sprints | [Value description] | Epic 1       | Medium     |
| Epic 3 | 2-3 sprints | [Value description] | Epic 2       | Low        |

**Breakdown Presentation:**
_"I've analyzed '[INITIATIVE_NAME]' and identified [X] epics that will deliver the initiative objectives incrementally. Here's my proposed breakdown and execution sequence. The sequencing prioritizes [key reasoning]. Each epic delivers specific user value: [brief summary]. What's your feedback on this approach?"_

### Step 5: Epic Review and Refinement

**AI Assistant Instructions:** Collaborate on epic structure refinement:

1. **Gather Feedback** on:

   - Epic scope and boundaries
   - Sequencing logic
   - Duration estimates
   - User value propositions

2. **Refine Based on Input**:

   - Adjust epic boundaries
   - Resequence if needed
   - Split or merge epics
   - Update duration estimates

3. **Validate Final Structure**:
   - Confirm each epic delivers end-to-end value
   - Verify single-team execution feasibility
   - Check alignment with initiative objectives

**Refinement Questions:**
_"Does the epic breakdown feel right for your development approach? Should any epics be split differently or resequenced? Do the duration estimates align with your team capacity?"_

### Step 6: Individual Epic Documentation

**AI Assistant Instructions:** Document each epic following the template:

1. **Present One Epic at a Time**: Start with the first epic in sequence
2. **Use Complete Template**: Fill all sections thoroughly
3. **Request Specific Feedback**:

   - Objective clarity and accuracy
   - Scope definition completeness
   - Success criteria measurability
   - Technical considerations coverage

4. **Iterate Until Approved**: Refine based on developer feedback
5. **Create in Tool**: Once approved, document in project management tool
6. **Move to Next Epic**: Continue sequential documentation

**Epic Presentation Format:**
_"Here's the detailed breakdown for Epic 1: [NAME]. I've focused on [key aspects]. The objective is [clear statement], and it will deliver [user value]. Are the scope boundaries clear? Do the success criteria capture what you want to achieve?"_

### Step 7: Epic Documentation in Tool

**AI Assistant Instructions:** Create epic records in project management tool:

1. **Follow Tool-Specific Format**: Adapt template to tool requirements
2. **Maintain Template Completeness**: Ensure all sections are captured
3. **Establish Hierarchy Linking**: Create proper linkage according to tool capabilities:
   - **Parent Link**: Connect epic to its parent initiative
   - **Child Link Preparation**: Set up epic to receive future user story links
   - **Tool-Specific Relationships**: Follow the linking methodology defined in `.pair/tech/adopted/way-of-working.md`
4. **Set Up Tracking**: Configure status tracking and progress monitoring
5. **Confirm Creation**: Verify epic is properly documented in tool

**Tool Documentation Checklist:**

- [ ] Epic created with complete template information
- [ ] Properly linked to parent initiative using tool-specific methodology
- [ ] Epic configured to receive user story links as child items
- [ ] Hierarchy relationships properly established in tool
- [ ] Sequence order clearly indicated
- [ ] Status tracking configured
- [ ] All stakeholders have access

### Step 8: Epic Sequence Finalization

**AI Assistant Instructions:** Complete the epic breakdown process:

1. **Verify Complete Breakdown**: Confirm all epics are documented
2. **Validate Sequence Logic**: Ensure execution order makes sense
3. **Check Initiative Coverage**: Verify epics fully deliver initiative objectives
4. **Update Initiative Status**: Mark initiative as "ready for development"
5. **Prepare Handoff**: Ready for user story breakdown phase

**Completion Summary:**
_"All epics for '[INITIATIVE_NAME]' are now documented and ready for development. The breakdown includes [X] epics spanning [duration] sprints. Each epic delivers specific user value and follows logical execution sequence. The initiative is now ready for user story breakdown when you're ready to start development."_

## Quality Assurance Framework

### Epic Quality Standards

**Content Quality:**

- [ ] Objective clearly states deliverable user value
- [ ] Business value connects to initiative goals and user needs
- [ ] Success criteria are specific, measurable, and user-focused
- [ ] Acceptance criteria cover key user scenarios
- [ ] Scope definition explicitly states inclusions and exclusions
- [ ] User story preview shows logical story breakdown
- [ ] Technical considerations address architecture and integration impact

**Structure Quality:**

- [ ] All template sections completed comprehensively
- [ ] Epic duration falls within 2-4 sprint range
- [ ] Dependencies are clearly identified and manageable
- [ ] Definition of Done includes all quality gates
- [ ] Documentation follows project management tool standards
- [ ] Hierarchy linking properly configured (Initiative → Epic → Future User Stories)
- [ ] Tool-specific relationship fields populated correctly

**Value Delivery:**

- [ ] Epic delivers end-to-end functionality users can interact with
- [ ] User impact is clearly defined and measurable
- [ ] Epic fits logically in initiative delivery sequence
- [ ] Business value justifies the development effort
- [ ] Success can be validated through user feedback

### Epic Breakdown Validation

**Sequencing Validation:**

- [ ] **Foundation First**: Core capabilities precede advanced features
- [ ] **User Journey Alignment**: Sequence follows natural user progression
- [ ] **Dependency Management**: No epic depends on later epics
- [ ] **Risk Distribution**: High-risk epics addressed early when possible
- [ ] **Value Progression**: Each epic adds meaningful user value

**Single-Team Execution:**

- [ ] **Sequential Development**: Epics designed for one-after-another execution
- [ ] **Resource Alignment**: Epic scope matches team capacity
- [ ] **Skill Requirements**: Team has necessary skills for each epic
- [ ] **Context Switching**: Minimal context changes between epics
- [ ] **Integration Points**: Clear handoff between epics

## Best Practices for AI Assistants

### Do's:

- **Always verify bootstrap completion** before starting epic breakdown
- **Always verify the project management tool** before starting epic breakdown
- **Always read the project management tool guidelines** before interacting with the tool
- **Analyze the complete initiative** before proposing epic structure
- **Focus on user value delivery** in every epic definition
- **Maintain end-to-end thinking** - avoid purely technical epics
- **Sequence for single-team execution** - assume serial development
- **Use concrete, measurable success criteria** that can be user-validated
- **Connect technical considerations** to user experience impact
- **Validate assumptions** through targeted questions rather than presumptions

### Don'ts:

- **Never skip prerequisite verification** - always check bootstrap status
- **Don't create epics without clear user value** - avoid technical-only breakdowns
- **Don't assume parallel execution** - design for sequential team development
- **Don't ignore initiative context** - every epic must contribute to initiative goals
- **Don't create oversized epics** - keep within 2-4 sprint boundaries
- **Don't underestimate dependencies** between epics
- **Don't finalize without developer approval** - maintain collaborative approach
- **Don't forget tool documentation** - ensure proper project management tool usage with correct hierarchy linking
- **Don't ignore linking requirements** - follow tool-specific methodology for Initiative-Epic-Story relationships

## Common Pitfalls and Solutions

| Pitfall                      | Impact                          | Solution                                                                                 |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Technical-only epics**     | No user value delivery          | Ensure every epic delivers functionality users can interact with                         |
| **Oversized epics**          | Lost focus and delayed feedback | Split large epics into 2-4 sprint increments                                             |
| **Parallel epic design**     | Team fragmentation              | Design sequential execution for single team                                              |
| **Missing user value**       | Development without purpose     | Connect every epic to specific user benefits                                             |
| **Weak acceptance criteria** | Unclear completion definition   | Use specific, testable criteria with user scenarios                                      |
| **Ignored dependencies**     | Development blocking            | Map all epic dependencies and sequence accordingly                                       |
| **Tool documentation gaps**  | Lost tracking and coordination  | Maintain complete documentation in project management tool with proper hierarchy linking |

---

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- `.pair/product/adopted/PRD.md` - Product vision, goals, and user requirements
- `.pair/way-of-working.md` - Development methodology and process definitions
- `.pair/product/backlog/01-initiatives/` - Strategic initiatives requiring epic breakdown (if filesystem is the tool)
- `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines.md` - Collaboration and Process Guidelines

**Technical Context:**

- `.pair/tech/adopted/architecture.md` - System architecture patterns and constraints
- `.pair/tech/adopted/tech-stack.md` - Technology choices and implementation guidelines
- `.pair/tech/adopted/infrastructure.md` - Infrastructure requirements and constraints
- `.pair/tech/adopted/ux-ui.md` - User experience and interface guidelines
- `.pair/tech/adopted/way-of-working.md` - Technical workflow and tool configuration

**Domain Context:**

- `.pair/product/adopted/subdomain/` - Functional domain boundaries and definitions
- `.pair/tech/adopted/boundedcontext/` - Technical context boundaries and integration points

**Process Dependencies:**

- **Prerequisites**: Bootstrap checklist must be completed before epic breakdown
- **Input**: Strategic initiatives serve as the foundation for epic identification
- **Output**: Epics serve as input for user story breakdown phase
- **Tool Integration**: All epics must be properly documented in configured project management tool with correct hierarchy linking (Initiative → Epic → User Story)
- **Linking Methodology**: Follow the specific linking approach defined in `.pair/tech/adopted/way-of-working.md` for tool-specific relationship management

This guide ensures a thorough, collaborative process that produces high-quality Epic breakdowns ready for user story development and successful incremental value delivery.
