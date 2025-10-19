# How to Breakdown User Stories - AI-Assisted Guide

## Overview

Transform Epics into User Story breakdowns through structured analysis and collaborative planning. User Stories serve as rough plannable units that capture user value with intentional uncertainty to be resolved during future refinement.

**Role**: User Story Breakdown Architect (Epic Decomposition)
**Process**: 🤖🤝👨‍💻 (AI proposes & structures, Developer validates & approves)

**CRITICAL FIRST STEP**: Before user story breakdown begins, verify epic readiness and project management tool configuration.

## Session State Management

**CRITICAL**: Maintain this context throughout user story breakdown:

```
USER STORY BREAKDOWN STATE:
├── Epic: [Epic Name and Priority]
├── Breakdown Status: [foundation | selection | identification | definition | documentation | completion]
├── PM Tool: [filesystem | github-projects | jira | linear | other]
├── PM Access: [tool-specific access method and linking approach]
├── Story Count: [X stories identified, epic coverage: Y%]
├── Template Used: [user-story-template.md]
├── Stories Created: [created: X/Y in tool]
└── Next Action: [specific next step]
```

## Core Principles

### Strategic Story Architecture

- **Verify epic readiness FIRST** - epic must be completed and ready for breakdown
- **Apply INVEST criteria** - follow [User Story Guidelines](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md#initial-breakdown-template)
- **Use vertical slicing** - each story delivers end-to-end user value with UI manifestation
- **Size for single sprint** - rough estimates with expected uncertainty
- **Focus on UI-first cutting** - every story produces visible, demonstrable value
- **Follow tool integration** - proper hierarchy linking per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
- **Maintain epic coverage** - ensure all epic scope addressed by stories
- **Document with templates** - use [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md#initial-breakdown-template)

**CRITICAL**: Before starting user story breakdown:

- **HALT if epic incomplete** - epic must be fully documented and ready
- **HALT if tool access unclear** - must understand PM tool hierarchy and linking
- **HALT if bootstrap incomplete** - verify [way-of-working.md](../adoption/tech/way-of-working.md) configuration
- **Do NOT proceed** without clear epic context and tool setup

## Implementation Workflow

### Phase 1: Foundation Verification

**Objective**: Verify prerequisites and establish epic context for breakdown.

1. **Verify Tool Configuration**:

   - Check [way-of-working.md](../adoption/tech/way-of-working.md) for PM tool setup
   - Validate access per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
   - Confirm hierarchy linking methodology (Epic → User Story)

2. **Handle Missing Configuration**:

   _"I need to verify user story breakdown prerequisites:_

   - _**Bootstrap Status**: [checked/missing foundation docs]_
   - _**PM Tool Configuration**: [tool name from way-of-working.md]_
   - _**Tool Access**: [verified per PM guidelines]_

   _Missing: [specific items]. Should we complete [missing elements] first or proceed with available context?"_

**Foundation Reference**: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)

### Phase 2: Epic Selection

**Objective**: Identify and confirm epic ready for user story breakdown.

1. **Apply Epic Selection Criteria**:

   - **Priority Order**: P0 > P1 > P2 epics in Todo state
   - **Avoid In-Progress**: Skip epics already broken down
   - **Bootstrap Epic Rule**: If Epic 0 exists, must breakdown first
   - **Check Epic Completeness**: Verify epic documentation complete

2. **Present Epic Recommendation**:

   _"Based on analysis, I recommend breaking down Epic '[EPIC_NAME]' (Priority: [P0/P1/P2], State: Todo) because:_

   - _[specific business value and readiness rationale]_
   - _[epic scope and user value alignment]_
   - _[estimated story count and breakdown readiness]_

   _This epic will deliver [key user value]. Should I proceed with user story breakdown for this epic?"_

**Selection Reference**: [Epic Breakdown](06-how-to-breakdown-epics.md)

### Phase 3: Story Identification

**Objective**: Identify user story candidates using epic context and story patterns.

1. **Analyze Epic Components**:

   - User story preview from epic documentation
   - User journey workflows and interaction patterns
   - CRUD operations and data variations
   - User roles and business scenarios

2. **Apply Story Patterns**:

   - **Workflow Steps**: Distinct user journey phases
   - **CRUD Operations**: Create → Read → Update → Delete
   - **Business Rules**: Different scenarios and conditions
   - **User Roles**: Admin, member, guest variations
   - **UI-First Cutting**: Every story produces visible UI value

3. **Present Story Candidates**:

   _"Story identification analysis for '[EPIC_NAME]':_

   **Story Patterns Identified**:

   - _Workflow Steps: [X] phases of user journey_
   - _CRUD Operations: [Y] data operations_
   - _Business Scenarios: [Z] rule variations_
   - _UI Value Points: Each story produces demonstrable UI element_

   **Candidate Stories** ([X] total):

   - _Story 1: [Name] - [User workflow step] - [Visible UI value]_
   - _Story 2: [Name] - [Data operation] - [UI interaction/feedback]_
   - _Story 3: [Name] - [Business scenario] - [UI display/control]_

   _Does this story identification capture the right user value breakdown and UI manifestations?"_

**Story Patterns Reference**: [Vertical Slicing Guidelines](.pair/knowledge/guidelines/collaboration/user-story-vertical-slicing.md)

### Phase 4: Story Definition & INVEST Validation

**Objective**: Define story scope and validate against INVEST criteria with UI-first approach.

1. **Define Story Scope**:

   - Clear story statement (persona, functionality, benefit)
   - UI-first cutting ensuring visible, demonstrable value
   - Rough scope boundaries with expected uncertainty
   - Initial sizing for planning purposes

2. **Apply INVEST Validation**:

   **For each story, validate**:

   - **Independent**: Can be planned separately
   - **Negotiable**: Focuses on user value, not implementation
   - **Valuable**: Provides clear benefit to user persona
   - **Estimable**: Scope clear enough for rough sizing
   - **Small**: Fits within single sprint
   - **Testable**: Outcome can be generally verified

3. **Present Story Breakdown**:

   _"Complete story breakdown with INVEST validation:_

   | Story  | Title  | UI Value                         | Dependencies | Size | Confidence |
   | ------ | ------ | -------------------------------- | ------------ | ---- | ---------- |
   | 01-001 | [Name] | [Visible UI element/interaction] | None         | M(3) | Medium     |
   | 01-002 | [Name] | [UI feedback/display]            | Story 001    | S(2) | High       |
   | 01-003 | [Name] | [UI control/screen]              | Story 001    | M(3) | Medium     |

   **INVEST Compliance**: All stories validated for independence, value, estimability
   **UI-First Approach**: Every story produces something demonstrable in sprint review
   **Epic Coverage**: [X]% of epic scope addressed by stories

   _This breakdown provides rough planning units with expected uncertainty. Approved for documentation?"_

**INVEST Reference**: [INVEST Criteria Guidelines](.pair/knowledge/guidelines/collaboration/user-story-invest-criteria.md)

### Phase 5: Documentation & Tool Creation

**Objective**: Document stories using template and create in project management tool.

1. **Document Individual Stories**:

   - Use complete [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md#initial-breakdown-template)
   - Focus on planning essentials (statement, value, scope, sizing)
   - Include UI value manifestation for demo readiness
   - Document uncertainties for future refinement

2. **Story Documentation Format**:

   _"Story [EPIC-STORY]: [NAME] documentation:_

   - _**Statement**: As a [persona], I want [functionality] so that [benefit]_
   - _**UI Value**: [Specific visible element/interaction for sprint demo]_
   - _**Rough Scope**: [Planning boundaries with uncertainty areas]_
   - _**Sizing**: [Points] with [confidence] because [reasoning]_

   _Does this story definition provide sufficient planning information while acknowledging expected uncertainties?"_

3. **Create in Project Management Tool**:
   - Follow tool-specific format per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
   - Establish proper hierarchy linking (Epic → User Story)
   - Configure basic tracking (status, priority, sizing)
   - Verify story sequence and dependencies

**Template Reference**: [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md#initial-breakdown-template)

### Phase 6: Coverage Validation & Completion

**Objective**: Validate epic coverage and prepare stories for backlog management.

1. **Validate Epic Coverage**:

   - All epic scope areas addressed by user stories
   - Epic objectives achievable through story completion
   - No critical gaps in user value delivery
   - Stories provide rough planning units for backlog

2. **Update Epic Status**:

   _"✅ USER STORY BREAKDOWN COMPLETE:_

   - _Epic '[EPIC_NAME]': [X] stories created spanning [estimated sprints]_
   - _Tool documentation: All stories properly linked in [PM_TOOL]_
   - _Epic coverage: [Y]% of scope addressed with planning-level detail_
   - _Status update: Epic changed from 'Todo' to 'In Progress'_

   _User story breakdown complete. Stories ready for backlog prioritization and future refinement."_

**Next Phase Reference**: [User Story Refinement](08-how-to-refine-a-user-story.md)

## Quality Assurance

**Essential Checklist**:

- [ ] Epic readiness verified and breakdown context established
- [ ] Story identification using patterns and epic context
- [ ] All stories follow INVEST criteria validation
- [ ] UI-first cutting applied - every story produces visible value
- [ ] Complete [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md#initial-breakdown-template) used
- [ ] Tool hierarchy properly established per [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
- [ ] Epic coverage validated and status updated
- [ ] Session state maintained throughout process

## Best Practices

### Do's ✅

- **Always verify epic readiness first** - epic must be complete and documented before breakdown
- **Start with Epic 0 if present** - bootstrap/setup stories must be broken down before functional stories
- **Apply UI-first story cutting** - every story must produce visible, demonstrable UI value
- **Use vertical slicing consistently** - each story delivers end-to-end user value
- **Follow INVEST principles religiously** - validate every story against all INVEST criteria
- **Maintain epic coverage awareness** - ensure all epic scope areas are addressed
- **Size stories roughly with confidence levels** - acknowledge uncertainty is expected at breakdown stage
- **Document using breakdown template** - use Initial Breakdown Template section consistently
- **Establish proper tool hierarchy** - Epic → User Story linkage per PM tool guidelines
- **Focus on user personas from PRD** - every story should benefit specific identified users
- **Include dependency identification** - capture high-level story dependencies
- **Preserve epic context throughout** - maintain connection to parent epic objectives

### Don'ts ❌

- **Never start without epic selection** - always propose and confirm epic choice based on priorities
- **Don't create horizontal slice stories** - avoid technical-only or UI-only stories without end-to-end value
- **Don't separate technical work from UI** - integrate backend functionality with visible UI manifestations
- **Don't over-specify at breakdown stage** - maintain appropriate uncertainty for later refinement
- **Don't ignore bootstrap epic rule** - Epic 0 must be broken down first if it exists
- **Don't create stories without UI value** - every story must be demonstrable in sprint review
- **Don't skip INVEST validation** - every story must satisfy all INVEST criteria
- **Don't assume detailed requirements** - focus on planning-level information only
- **Don't create oversized stories** - keep within single sprint boundaries
- **Don't forget epic coverage** - ensure major epic scope areas are addressed by stories
- **Don't bypass tool integration** - proper PM tool documentation is mandatory
- **Don't treat uncertainty as failure** - ambiguity is expected and normal at breakdown stage

## Common Pitfalls & Solutions

| Pitfall                                          | Impact                                                    | Solution                                                                                |
| ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Starting without epic readiness verification** | Incomplete context leads to poor story identification     | Always verify epic is fully documented and approved before breakdown                    |
| **Creating horizontal slice stories**            | Stories don't deliver identifiable user value             | Apply vertical slicing - each story must include UI manifestation of value              |
| **Ignoring Bootstrap Epic Rule**                 | Technical foundation work planned after business features | Always identify and breakdown Epic 0 first if it exists                                 |
| **Over-specifying story details**                | Premature requirement elaboration at wrong stage          | Focus on planning essentials only - detailed requirements come during refinement        |
| **Missing UI-first approach**                    | Stories can't be demonstrated in sprint review            | Every story must produce visible UI value - screen, interaction, feedback, data display |
| **Weak INVEST compliance**                       | Stories can't be planned or estimated effectively         | Validate every story against all INVEST criteria systematically                         |
| **Poor epic coverage**                           | Missing functionality gaps discovered late                | Map all epic scope areas to stories before concluding breakdown                         |
| **Inconsistent sizing approach**                 | Capacity planning becomes unreliable                      | Use consistent sizing criteria with confidence levels - uncertainty is expected         |
| **Tool integration gaps**                        | Lost traceability and coordination issues                 | Establish proper Epic → User Story hierarchy in PM tool                                 |
| **Forgetting user personas**                     | Stories don't align with actual user needs                | Every story must benefit specific user personas identified in PRD                       |
| **Dependency blindness**                         | Sprint planning complications due to unknown dependencies | Identify high-level story dependencies during breakdown                                 |
| **Context drift during breakdown**               | Losing sight of epic objectives and constraints           | Maintain session state tracking and epic context throughout process                     |

## References

### Core Dependencies

- [Epic Breakdown](06-how-to-breakdown-epics.md) - Input source for user story breakdown
- [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) - Tool integration and hierarchy linking
- [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md) - Foundation verification

### Implementation Guidelines

- [User Story Template](.pair/knowledge/guidelines/collaboration/templates/user-story-template.md#initial-breakdown-template) - Complete documentation structure
- [INVEST Criteria Guidelines](.pair/knowledge/guidelines/collaboration/user-story-invest-criteria.md) - Story validation framework
- [Vertical Slicing Guidelines](.pair/knowledge/guidelines/collaboration/user-story-vertical-slicing.md) - Story cutting patterns

### Next Phase

- [User Story Refinement](08-how-to-refine-a-user-story.md) - Transform breakdown stories into development-ready specifications
