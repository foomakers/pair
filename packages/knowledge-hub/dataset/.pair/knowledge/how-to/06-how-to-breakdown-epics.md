# How to Breakdown Epics - AI-Assisted Guide

## Overview

Transform strategic initiatives into comprehensive Epic breakdowns through structured analysis and collaborative planning. Epics bridge strategic initiatives and executable user stories, ensuring incremental value delivery, technical coherence, and optimal development flow.

**Role**: Product Owner/Manager (Strategic Decomposition)  
**Process**: 🤖🤝👨‍💻 (AI proposes & structures, Developer validates & approves)

**CRITICAL FIRST STEP**: Before epic breakdown begins, verify initiative readiness and project management tool configuration.

## Session State Management

**CRITICAL**: Maintain this context throughout epub breakdown:

```
EPIC BREAKDOWN STATE:
├── Initiative: [Initiative Name and Priority]
├── Breakdown Status: [foundation | selection | analysis | proposal | documentation | completion]
├── PM Tool: [filesystem | github-projects | jira | linear | other]
├── PM Access: [tool-specific access method and linking approach]
├── Epic Count: [X epics identified, duration: Y sprints total]
├── Bootstrap Epic: [epic-0 required: Yes/No, status: created/missing]
├── Template Used: [epic-template.md]
└── Next Action: [specific next step]
```

## Core Principles

### Strategic Epic Architecture

- **Select ready initiatives FIRST** - focus on Todo state, P0 > P1 > P2 priority
- **Design for sequential execution** - single-team development with clear dependencies
- **Ensure end-to-end value delivery** - each epic provides complete user functionality
- **Size for 2-4 sprints** - manageable increments with measurable outcomes
- **Plan Epic 0 for new projects** - application bootstrap and technical foundation
- **Follow collaborative validation** - structured feedback loops with developer approval
- **Document comprehensively** - use [Epic Template](.pair/knowledge/guidelines/collaboration/templates/epic-template.md)
- **Maintain tool integration** - proper hierarchy linking per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)

**CRITICAL**: Before starting epic breakdown:

- **HALT if bootstrap incomplete** - verify [way-of-working.md](../adoption/tech/way-of-working.md) and tool configuration
- **HALT if no Todo initiatives** - initiatives must be ready for breakdown
- **HALT if tool access unclear** - must understand PM tool hierarchy and linking approach
- **Do NOT proceed** without clear initiative selection and technical context

## Implementation Workflow

### Phase 1: Foundation Setup

**Objective**: Verify prerequisites and establish initiative context for breakdown.

1. **Verify Bootstrap Completion**:

   - Confirm [way-of-working.md](../adoption/tech/way-of-working.md) exists with PM tool configuration
   - Check foundational documents: PRD, architecture, tech-stack, boundedcontext
   - Validate PM tool access per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)

2. **Handle Missing Prerequisites**:

   _"I need to verify epic breakdown prerequisites:_

   - _**Bootstrap Status**: [checked/missing foundation docs]_
   - _**PM Tool Configuration**: [tool name from way-of-working.md]_
   - _**Tool Access**: [verified per PM guidelines]_

   _Missing: [specific items]. Should we complete [missing elements] first or proceed with available context?"_

**Foundation Reference**: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)

### Phase 2: Initiative Selection

**Objective**: Identify highest-priority Todo initiative ready for epic breakdown.

1. **Apply Initiative Selection Criteria**:

   - **Priority Order**: P0 > P1 > P2 initiatives in Todo state
   - **Avoid In-Progress**: Skip initiatives already being executed
   - **Check Dependencies**: Ensure initiative readiness for breakdown
   - **Assess Team Readiness**: Verify technical and business context

2. **Present Initiative Recommendation**:

   _"Based on analysis, I recommend breaking down Initiative '[INITIATIVE_NAME]' (Priority: [P0/P1/P2], State: Todo) because:_

   - _[specific business value and readiness rationale]_
   - _[scope and technical alignment]_
   - _[estimated epic count and duration]_

   _This initiative will deliver [key user value]. Should I proceed with epic breakdown for this initiative?"_

**Selection Reference**: [Initiative Guidelines](.pair/knowledge/guidelines/collaboration/templates/initiative-template.md)

### Phase 3: Epic Analysis & Proposal

**Objective**: Analyze initiative deeply and propose comprehensive epic structure.

1. **Analyze Initiative Components**:

   - Business objectives and success metrics from PRD context
   - User value propositions and journey stages
   - Technical requirements from architecture and tech-stack
   - Bounded context alignment for service boundaries

2. **Identify Epic Structure**:

   - **Epic 0 Assessment**: For new projects, determine if application bootstrap epic needed
   - **Value-Driven Grouping**: Natural feature groupings following user workflows
   - **Sequential Dependencies**: Foundation-first, user journey progression
   - **Duration Sizing**: 2-4 sprint epics with clear completion criteria

3. **Present Epic Breakdown Proposal**:

   _"Epic breakdown analysis for '[INITIATIVE_NAME]':_

   **Epic Structure** ([X] epics, [Y] sprints total):

   - _Epic 0: Application Bootstrap [if needed] (2-3 sprints) - Technical foundation_
   - _Epic 1: [Name] (2-3 sprints) - [Core user value]_
   - _Epic 2: [Name] (3-4 sprints) - [Extended functionality]_
   - _Epic 3: [Name] (2-3 sprints) - [Advanced features]_

   **Execution Logic**: [Foundation → Core → Extensions → Advanced] with clear user value at each stage.

   _Does this breakdown structure align with your development approach and initiative objectives?"_

**Epic Sizing Reference**: [Epic Template](.pair/knowledge/guidelines/collaboration/templates/epic-template.md)

### Phase 4: Epic Documentation & Creation

**Objective**: Document each epic comprehensively and create in project management tool.

1. **Document Individual Epics**:

   - Use complete [Epic Template](.pair/knowledge/guidelines/collaboration/templates/epic-template.md) structure
   - Start with Epic 0 (if required), then sequential order
   - Include objective, scope, success criteria, technical considerations
   - Define clear user value and business rationale

2. **Epic Presentation Format**:

   _"Epic [N]: [NAME] documentation:_

   - _**Objective**: [Clear user-value statement]_
   - _**Duration**: [2-4 sprints with rationale]_
   - _**Success Criteria**: [Measurable, user-focused outcomes]_
   - _**Technical Scope**: [Architecture and integration considerations]_
   - _**Dependencies**: [Previous epics or external requirements]_

   _Does this epic definition capture the right scope and value delivery? Any adjustments needed?"_

3. **Create in Project Management Tool**:
   - Follow tool-specific format per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
   - Establish proper hierarchy linking (Initiative → Epic → Future User Stories)
   - Configure epic tracking and progress monitoring
   - Verify epic sequence and dependencies are documented

**Documentation Reference**: [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)

### Phase 5: Completion & State Management

**Objective**: Finalize epic breakdown and prepare for user story phase.

1. **Validate Complete Breakdown**:

   - All epics documented with comprehensive template information
   - Epic sequence logic verified (foundation → user value progression)
   - Initiative objectives fully covered by epic scope
   - Tool hierarchy properly established with linking

2. **Update Initiative Status**:

   _"✅ EPIC BREAKDOWN COMPLETE:_

   - _Initiative '[INITIATIVE_NAME]': [X] epics created spanning [Y] sprints_
   - _Epic sequence: [Epic 0 →] Epic 1 → Epic 2 → Epic 3 [example flow]_
   - _Tool documentation: All epics properly linked in [PM_TOOL]_
   - _Status update: Initiative changed from 'Todo' to 'In Progress'_

   _Epic breakdown complete. Ready to proceed with user story breakdown when development begins."_

**Next Phase Reference**: [User Story Breakdown](07-how-to-breakdown-user-stories.md)

## Quality Assurance

**Essential Checklist**:

- [ ] Bootstrap completion verified and PM tool configured
- [ ] Todo initiative selected based on priority (P0 > P1 > P2)
- [ ] Epic 0 assessed for new projects (created if needed)
- [ ] All epics deliver end-to-end user value in 2-4 sprints
- [ ] Epic sequence follows logical dependencies (foundation → user value)
- [ ] Complete [Epic Template](.pair/knowledge/guidelines/collaboration/templates/epic-template.md) used for each epic
- [ ] Tool hierarchy properly established per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
- [ ] Initiative status updated from 'Todo' to 'In Progress'
- [ ] Session state maintained throughout process

## References

### Core Dependencies

- [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md) - Foundation verification
- [Initiative Creation](03-how-to-create-and-prioritize-initiatives.md) - Input source for epic breakdown
- [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) - Tool integration and hierarchy linking

### Implementation Guidelines

- [Epic Template](.pair/knowledge/guidelines/collaboration/templates/epic-template.md) - Complete documentation structure
- [Initiative Template](.pair/knowledge/guidelines/collaboration/templates/initiative-template.md) - Parent context understanding

### Next Phase

- [User Story Breakdown](07-how-to-breakdown-user-stories.md) - Transform epics into executable user stories
