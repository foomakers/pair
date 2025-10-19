# How to Refine a User Story - AI-Assisted Guide

## Overview

Transform User Stories from rough breakdown units into development-ready specifications through collaborative analysis and detailed requirements gathering. Story refinement converts intentional uncertainty into comprehensive acceptance criteria and technical clarity.

**Role**: User Story Refinement Facilitator (Requirements Analysis)
**Process**: 🤖🤝👨‍💻 (AI analyzes & proposes, Developer validates & approves)

**CRITICAL FIRST STEP**: Before refinement begins, verify story selection and project management tool access configuration.

## Session State Management

**CRITICAL**: Maintain this context throughout story refinement:

```
STORY REFINEMENT STATE:
├── Story: [Story ID and Title]
├── Refinement Status: [selection | analysis | requirements | validation | documentation | completion]
├── PM Tool: [filesystem | github-projects | jira | linear | other]
├── PM Access: [tool-specific access method]
├── Template Used: [user-story-template.md refined section]
├── Sizing: [original: X pts, refined: Y pts, split: Yes/No]
├── Ready for Sprint: [Yes/No - all criteria met]
└── Next Action: [specific next step]
```

## Core Principles

### Refinement Excellence Standards

- **Select highest priority Todo stories** - follow P0 > P1 > P2 priority order
- **Transform uncertainty into clarity** - resolve all open questions and ambiguities
- **Apply comprehensive acceptance criteria** - use Given-When-Then format per [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)
- **Conduct technical risk analysis** - identify implementation challenges and spikes
- **Validate sprint readiness** - ensure story fits capacity or split appropriately
- **Maintain INVEST compliance** - verify all INVEST criteria remain satisfied
- **Document with refined template** - complete all sections of [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)

**CRITICAL**: Before starting story refinement:

- **HALT if no Todo stories** - must have stories from breakdown phase
- **HALT if tool access unclear** - verify PM tool configuration per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
- **HALT if template not reviewed** - must understand refined story structure
- **Do NOT proceed** without clear story selection and template understanding

## Implementation Workflow

### Phase 1: Story Selection

**Objective**: Identify and confirm story ready for refinement.

1. **Apply Story Selection Criteria**:

   - **Priority Order**: P0 > P1 > P2 stories in Todo state
   - **Sprint Planning Needs**: Stories required for upcoming sprint
   - **Epic Context**: Related stories that benefit from group refinement
   - **Dependency Chain**: Stories blocking other development work

2. **Present Story Recommendation**:

   _"Based on backlog analysis, I recommend refining Story '[STORY_ID]: [STORY_NAME]' (Priority: [P0/P1/P2]) because:_

   - _[specific business value and sprint urgency]_
   - _[current uncertainty areas requiring resolution]_
   - _[estimated refinement effort and story readiness]_

   _This story addresses [user need] and is needed for [sprint timeline]. Should I proceed with detailed refinement?"_

**Selection Reference**: [User Story Breakdown](07-how-to-breakdown-user-stories.md)

### Phase 2: Requirements Analysis

**Objective**: Transform rough scope into detailed, testable acceptance criteria.

1. **Expand Acceptance Criteria**:

   - Convert general requirements into specific Given-When-Then scenarios
   - Address edge cases and error handling conditions
   - Define business rules and validation requirements
   - Specify user experience and interaction details

2. **Apply Requirements Gathering**:

   _"Current story scope: '[current scope description]'. I need to gather detailed requirements:_

   **Core Functionality**:

   - _What specific actions should users be able to perform?_
   - _What business rules govern these interactions?_
   - _What validation and error handling is required?_

   **User Experience**:

   - _What should users see and how should they interact?_
   - _What feedback and confirmation should they receive?_
   - _What accessibility requirements apply?_

   _Based on your input, I'll create comprehensive Given-When-Then acceptance criteria."_

**Requirements Reference**: [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)

### Phase 3: Technical Analysis

**Objective**: Assess implementation approach and identify technical risks.

1. **Implementation Strategy**:

   - Define technical approach and architecture alignment
   - Identify required components and integration points
   - Assess performance and scalability considerations
   - Evaluate security and compliance requirements

2. **Risk Assessment**:

   - Identify technical unknowns requiring spikes
   - Assess complexity and potential implementation challenges
   - Evaluate dependencies on other systems or teams
   - Document mitigation strategies for identified risks

3. **Present Technical Analysis**:

   _"Technical analysis for story implementation:_

   **Implementation Approach**:

   - _[High-level technical strategy and components]_
   - _[Integration points and data flow]_
   - _[Alignment with current architecture]_

   **Risks and Unknowns**:

   - _[Technical challenges requiring investigation]_
   - _[Dependencies and coordination needs]_
   - _[Proposed spikes and research tasks]_

   _Does this technical approach align with project architecture and team capabilities?"_

**Technical Reference**: [Architecture Guidelines](.pair/knowledge/guidelines/technical/architecture-patterns.md)

### Phase 4: Sprint Readiness Validation

**Objective**: Validate story size and ensure sprint deliverability.

1. **Sizing Validation**:

   - Re-estimate story complexity with detailed requirements
   - Assess effort against team capacity and sprint duration
   - Consider risk factors and unknown elements
   - Factor in testing, review, and integration time

2. **Splitting Analysis**:

   - Identify value-preserving split opportunities if oversized
   - Ensure each split maintains end-to-end user value
   - Define dependencies between split stories
   - Validate split stories follow INVEST principles

3. **Present Sizing Assessment**:

   _"Story sizing analysis with detailed requirements:_

   **Original Estimate**: [X points] → **Refined Estimate**: [Y points]
   **Sprint Capacity**: [team capacity] → **Story Fit**: [fits/exceeds]

   _[If exceeds capacity]:_
   **Splitting Recommendation**:

   - _Story A: [core value] - [Z points]_
   - _Story B: [extended value] - [W points]_
   - _Split maintains user value and INVEST compliance_

   _Does this sizing and potential splitting preserve user value appropriately?"_

**Sizing Reference**: [Story Estimation Guidelines](.pair/knowledge/guidelines/collaboration/story-sizing-standards.md)

### Phase 5: Documentation and Tool Updates

**Objective**: Complete comprehensive story documentation and update tracking tools.

1. **Template Documentation**:

   - Complete all sections of [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)
   - Include detailed acceptance criteria and technical analysis
   - Document dependencies, risks, and implementation notes
   - Specify Definition of Done checklist items

2. **Tool Integration**:

   - Update story status from Todo to Refined
   - Configure sizing, priority, and dependency metadata
   - Link related stories and epic hierarchy
   - Prepare story for sprint planning selection

3. **Refinement Completion**:

   _"✅ STORY REFINEMENT COMPLETE:_

   - _Story '[STORY_ID]': Comprehensive acceptance criteria and technical analysis documented_
   - _Tool Status: Updated to 'Refined' with [final sizing] and dependencies configured_
   - _Sprint Ready: [Yes/No] - all ambiguities resolved_
   - _Next Phase: Ready for task breakdown and development_

   _Story refinement complete. All details documented and ready for sprint execution."_

**Template Reference**: [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md)

## Quality Assurance

**Essential Checklist**:

- [ ] Story selected based on priority and sprint planning needs
- [ ] Acceptance criteria comprehensive and testable (Given-When-Then format)
- [ ] Technical approach and risks thoroughly analyzed
- [ ] Story sized appropriately for sprint or split with value preservation
- [ ] All uncertainties and open questions resolved
- [ ] [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md) completed
- [ ] Tool updated with refined status and metadata
- [ ] Story ready for immediate development start

## Best Practices

### Do's ✅

- **Always select highest priority Todo stories** - follow P0 > P1 > P2 priority order
- **Apply comprehensive requirements gathering** - resolve all ambiguities and open questions
- **Use Given-When-Then format consistently** - ensure all acceptance criteria are testable
- **Conduct thorough technical analysis** - identify implementation approach and risks
- **Validate sprint sizing rigorously** - split stories that exceed capacity while preserving value
- **Complete template documentation fully** - use all sections of refined user story template
- **Update tool metadata accurately** - maintain proper status and dependency tracking
- **Focus on development readiness** - eliminate all uncertainties before marking refined
- **Preserve INVEST compliance** - verify all criteria remain satisfied after refinement
- **Address edge cases systematically** - include error handling and validation scenarios
- **Document technical dependencies** - identify coordination needs with other teams or systems
- **Align with Definition of Done** - ensure story completion criteria are clear and measurable

### Don'ts ❌

- **Never refine without story selection** - always propose and confirm specific story choice
- **Don't leave acceptance criteria vague** - every criterion must be specific and testable
- **Don't ignore technical complexity** - always assess implementation risks and unknowns
- **Don't allow oversized stories** - split appropriately to maintain sprint deliverability
- **Don't skip edge case analysis** - address error conditions and validation requirements
- **Don't assume implementation details** - collaborate on technical approach and architecture
- **Don't forget dependency mapping** - identify all coordination requirements
- **Don't rush refinement quality** - ensure comprehensive coverage before completion
- **Don't bypass tool updates** - maintain accurate status and metadata
- **Don't ignore Definition of Done** - align story completion with project standards
- **Don't split stories arbitrarily** - preserve user value when breaking down oversized work
- **Don't finalize with open questions** - resolve all uncertainties before marking refined

## Common Pitfalls & Solutions

| Pitfall                                 | Impact                                    | Solution                                                                   |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| **Vague acceptance criteria**           | Development ambiguity and scope creep     | Use Given-When-Then format with specific, measurable conditions            |
| **Missing edge case analysis**          | Production bugs and user frustration      | Systematically review error conditions, validation, and boundary scenarios |
| **Insufficient technical analysis**     | Implementation blocks and delivery risks  | Conduct thorough technical review with architecture and risk assessment    |
| **Oversized story scope**               | Sprint capacity exceeded, incomplete work | Validate sizing and split stories while preserving end-to-end user value   |
| **Incomplete requirements gathering**   | Rework and development delays             | Use structured questioning to gather comprehensive functional requirements |
| **Poor dependency identification**      | Team coordination issues and blocks       | Map all technical and process dependencies with other work streams         |
| **Weak Definition of Done alignment**   | Inconsistent completion standards         | Ensure story DoD aligns with project quality and delivery standards        |
| **Technical risk blindness**            | Implementation surprises and delays       | Identify unknowns requiring spikes and research before development         |
| **Tool integration gaps**               | Lost traceability and poor coordination   | Maintain accurate status updates and dependency linking in PM tool         |
| **Context drift during refinement**     | Losing sight of epic objectives           | Maintain session state tracking and original story purpose throughout      |
| **Premature technical specification**   | Over-engineering and implementation bias  | Focus on requirements and outcomes, allow implementation flexibility       |
| **Insufficient user experience detail** | Poor usability and user satisfaction      | Define specific interaction patterns, feedback, and accessibility needs    |

## References

### Core Dependencies

- [User Story Breakdown](07-how-to-breakdown-user-stories.md) - Input source for refinement candidates
- [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) - Tool access and story management
- [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md) - Foundation verification

### Implementation Guidelines

- [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md) - Complete documentation structure
- [Story Estimation Guidelines](.pair/knowledge/guidelines/collaboration/story-sizing-standards.md) - Sizing and splitting standards
- [Architecture Guidelines](.pair/knowledge/guidelines/technical/architecture-patterns.md) - Technical analysis framework

### Next Phase

- [Create Tasks](09-how-to-create-tasks.md) - Transform refined stories into development tasks
