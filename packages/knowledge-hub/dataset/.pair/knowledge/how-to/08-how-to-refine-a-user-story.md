# How to Refine a User Story - AI-Assisted Guide

## Overview

This guide enables developers and AI assistants to collaboratively refine User Stories from their initial breakdown state into development-ready work items through structured, iterative analysis. User Story refinement transforms **rough plannable units** into **detailed, implementable specifications** with comprehensive acceptance criteria, technical clarity, and development readiness.

**Key Benefits of User Story Refinement:**

- Transform rough story concepts into detailed, actionable development requirements
- Establish comprehensive acceptance criteria and testable completion conditions
- Identify technical implementation approaches, risks, and required spikes
- Align cross-functional team understanding of story scope and expectations
- Validate story readiness for sprint planning and development execution
- Ensure proper story sizing and identify splitting needs for sprint capacity

**Important: Stories enter refinement as intentionally incomplete breakdown artifacts** and exit as comprehensive, development-ready specifications with detailed acceptance criteria, technical analysis, and validated sprint-sized scope.

## AI Assistant Role Definition

**Primary Role**: User Story Refinement Facilitator with expertise in requirements analysis and development planning

The AI assistant acts as a **User Story Refinement Facilitator** who:

- **Analyzes** backlog stories to identify refinement priorities and group candidates
- **Facilitates** collaborative story analysis through structured refinement techniques
- **Guides** detailed acceptance criteria definition and technical requirement specification
- **Identifies** technical risks, dependencies, and spike requirements
- **Validates** story completeness, testability, and sprint-readiness
- **Proposes** story splitting when refined scope exceeds sprint capacity

**Working Principles**: Follow the **🤖🤝👨‍💻** model (LLM proposes, Developer validates) throughout the entire refinement process.

## Prerequisite

Before starting, **read and consult the Refined User Story Template**: [Refined User Story Template](.pair/knowledge/guidelines/collaboration/assets/user-story-template.md). All required structure and fields are defined in the template.

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

## User Story Refinement Definition

> **Best Practice:** Refined user stories must be completely To Do with no ambiguity about expected outcomes. All acceptance criteria should be testable and verifiable. Technical approach and implementation risks should be understood and documented.

### What is User Story Refinement?

**User Story Refinement** is the collaborative process that transforms breakdown-stage stories into development-ready specifications by:

- **Adding Detailed Requirements**: Comprehensive acceptance criteria, business rules, and edge case handling
- **Technical Analysis**: Implementation approach, architectural considerations, and technical risks
- **Validation and Testing**: Testable completion criteria and verification approaches
- **Sprint Readiness**: Proper sizing validation and splitting identification when necessary
- **Cross-functional Alignment**: Shared understanding across development team roles

### Refinement vs Breakdown

| Aspect                  | Breakdown Stage                    | Refined Stage                           |
| ----------------------- | ---------------------------------- | --------------------------------------- |
| **Purpose**             | Epic planning and backlog creation | Development execution preparation       |
| **Detail Level**        | Rough scope and user value         | Comprehensive requirements and criteria |
| **Acceptance Criteria** | Open questions and uncertainties   | Detailed, testable conditions           |
| **Technical Analysis**  | High-level considerations          | Implementation approach and risks       |
| **Sizing Confidence**   | Rough estimates with uncertainty   | Validated sizing with splitting needs   |
| **Team Involvement**    | Product-focused analysis           | Cross-functional collaborative analysis |

## Story Selection and Prioritization

### Step 0: Story Selection Analysis and Proposal

**AI Assistant Instructions:** Begin with comprehensive story analysis and selection proposal:

**Phase 0A: Backlog Story Analysis**

1. **Priority-Based Story Selection**: Identify user stories ready for refinement following this priority order:

   - **Primary Target**: User stories in "Todo" state with highest priority (P0 > P1 > P2)
   - **Epic Context**: Focus on stories from epics ready for development
   - **Dependencies**: Consider story dependencies and logical refinement sequences
   - **Sprint Readiness**: Prioritize stories needed for upcoming sprint planning

2. **Epic-Based Grouping**: Organize stories by epic context:

   - Highest priority epics with ready stories
   - Story dependencies within epic scope
   - Logical refinement sequences for epic progress
   - Cross-story considerations and shared components

3. **Priority Assessment**: Evaluate refinement candidates based on:
   - Business priority (P0 > P1 > P2) and user value urgency
   - Epic progress and milestone requirements
   - Technical dependency sequencing
   - Team capacity and sprint planning needs

**Phase 0B: Refinement Proposal**

4. **Propose Priority Stories**: Based on analysis, recommend specific stories for refinement:

   _"I've analyzed all todo stories and identified refinement opportunities. Based on priority, dependencies, and logical grouping, I recommend refining these stories from Epic '[EPIC_NAME]':_

   **Recommended for Refinement:**

   | Story Code | Title               | Priority | Dependencies | Readiness | Reasoning                     |
   | ---------- | ------------------- | -------- | ------------ | --------- | ----------------------------- |
   | [Code]     | [Story Title]       | High     | None         | Ready     | Foundation story, no blockers |
   | [Code]     | [Related Story]     | High     | Story above  | Ready     | Logical continuation          |
   | [Code]     | [Independent Story] | Medium   | None         | Ready     | Parallel development possible |

   _This grouping allows focused refinement of related functionality while maintaining development flow. Would you like to proceed with this selection, or would you prefer to refine different stories?"_

   **User Confirmation Required**: _"I recommend refining User Story '[STORY_CODE]: [STORY_NAME]' (Priority [P0/P1/P2]) next. This story will deliver [brief story value] and is ready for detailed refinement. Should I proceed with refining this story?"_

5. **Handle Ad-hoc Story Requests**: Support developer-driven story selection:
   - Accept specific story requests even if not highest priority
   - Provide analysis views for developer decision-making
   - Offer refinement guidance for any valid todo story

### Story Analysis Views for Decision Support

**AI Assistant Instructions:** Provide analysis views to support story selection decisions:

#### Epic Progress View

```markdown
## Epic: [Epic Name] - Story Refinement Status

**Epic Progress**: [X/Y] stories refined, [A/B] story points completed

| Status      | Story Count | Story Points | Stories                      |
| ----------- | ----------- | ------------ | ---------------------------- |
| Refined     | X           | XX           | [List completed stories]     |
| Todo        | Y           | YY           | [List remaining stories]     |
| In Progress | Z           | ZZ           | [List stories being refined] |

**Next Logical Stories for Refinement**: [Recommendations based on dependencies and flow]
```

#### Priority and Dependency View

```markdown
## Todo Stories - Priority and Dependency Analysis

**High Priority Ready for Refinement:**

- [Story Code]: [Title] - [Why high priority, no blockers]
- [Story Code]: [Title] - [Dependencies and reasoning]

**Medium Priority Available:**

- [Story Code]: [Title] - [Why medium priority]

**Blocked or Dependent Stories:**

- [Story Code]: [Title] - [Blocking dependencies]

**Recommended Refinement Sequence**: [Logical order based on dependencies and priority]
```

#### Sprint Planning View

```markdown
## Sprint Readiness - Story Refinement Pipeline

**Sprint [N] Candidates** (Stories likely needed for upcoming sprint):

- [Story Code]: [Title] - [Refinement status and urgency]

**Sprint [N+1] Pipeline** (Stories for future sprints):

- [Story Code]: [Title] - [Preparation timeline]

**Refinement Recommendations**:

- Immediate: [Stories needed for next sprint]
- Next Week: [Stories for sprint pipeline]
- Future: [Lower priority stories]
```

---

**Project Management Tool Usage**

Before documenting refined user stories, identify the configured project management tool as specified in `.pair/adoption/tech/way-of-working.md`. Access the tool using the provided credentials or links. Follow the usage and collaboration instructions in `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` for interfacing, linking items, and managing story records. Please refer to this documentation any time the guide asks for project management tool actions.

---

## User Story Refinement Template

> **Note:** This [template](.pair/knowledge/guidelines/collaboration/assets/user-story-template.md) transforms the initial breakdown information into comprehensive, development-ready specifications. All sections must be completed with testable, implementable details.

User story refined must follow this comprehensive [template](.pair/knowledge/guidelines/collaboration/assets/user-story-template.md) you find in the [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md).

## Structured Refinement Process

### Step 1: Story Context Review and Validation

**AI Assistant Instructions:** Begin refinement with comprehensive context review:

1. **Review Story Breakdown**: Analyze the selected story's current state:

   - Story statement and user value proposition
   - Initial scope definition and open questions
   - Epic context and business objectives
   - Current sizing estimate and confidence level

2. **Validate Story Foundation**: Confirm story readiness for refinement:

   - Story follows INVEST principles from breakdown
   - Clear user persona and value identification
   - Epic alignment and contribution understanding
   - No blocking dependencies preventing refinement

3. **Establish Refinement Scope**: Define what needs to be refined:
   - Specific areas of uncertainty to resolve
   - Detailed requirements to be specified
   - Technical analysis required
   - Cross-functional coordination needs

**Context Review Presentation:**
_"I'm beginning refinement for User Story [STORY_CODE]: [TITLE]. The story aims to deliver [user value] for [persona]. From the breakdown, I can see the main uncertainty areas are [list uncertainties]. The story currently has [open questions] that need resolution. The epic context shows [epic alignment]. Are you ready to proceed with detailed refinement of this story?"_

### Step 2: Detailed Requirements Analysis

**AI Assistant Instructions:** Collaborate on comprehensive requirements definition:

1. **Expand Acceptance Criteria**: Transform rough scope into detailed requirements:

   - Convert scope boundaries into specific acceptance criteria
   - Define functional requirements using Given-When-Then format
   - Specify business rules and validation requirements
   - Address edge cases and error handling scenarios

2. **Business Rules Definition**: Clarify business logic and constraints:

   - Data validation and processing rules
   - User permission and access control requirements
   - Integration requirements with existing systems
   - Compliance and regulatory considerations

3. **User Experience Specification**: Define user interaction details:

   - User interface behavior and feedback
   - User workflow and navigation requirements
   - Error messaging and user guidance
   - Accessibility and usability standards

4. **Data and Integration Requirements**: Specify technical data needs:
   - Data input, validation, and storage requirements
   - API integration specifications
   - External system communication protocols
   - Data transformation and processing logic

### Step 3: Technical Analysis and Risk Assessment

**AI Assistant Instructions:** Conduct comprehensive technical analysis:

1. **Implementation Approach Analysis**: Define technical strategy:

   - High-level technical architecture and approach
   - Key components and system integration points
   - Data flow and processing requirements
   - Performance and scalability considerations

2. **Technical Risk Identification**: Assess development risks:

   - Technical complexity and unknowns
   - Integration challenges and dependencies
   - Performance and scalability risks
   - Security and compliance technical requirements

3. **Spike Requirements Assessment**: Identify research needs:

   - Technical investigations required before development
   - Proof-of-concept work needed for risk mitigation
   - Third-party integration research requirements
   - Performance testing and validation needs

4. **Technical Dependency Analysis**: Map technical coordination:
   - Shared technical components with other stories
   - Infrastructure and environment requirements
   - Third-party service dependencies
   - Technical team coordination needs

### Step 4: Definition of Done Alignment

**AI Assistant Instructions:** Establish comprehensive completion criteria:

1. **Development Standards Alignment**: Apply project DoD standards:

   - Code quality and review requirements
   - Testing coverage and validation standards
   - Documentation and knowledge sharing requirements
   - Security and compliance validation needs

2. **Quality Assurance Requirements**: Define testing and validation:

   - Functional testing and acceptance validation
   - Performance and usability testing requirements
   - Cross-platform and browser testing needs
   - User acceptance and feedback collection

3. **Deployment and Release Readiness**: Specify deployment requirements:
   - Environment and infrastructure requirements
   - Feature flag and rollout strategy
   - Monitoring and alerting configuration
   - User communication and documentation needs

### Step 5: Story Sizing Validation and Splitting Analysis

**AI Assistant Instructions:** Validate story size and identify splitting needs:

1. **Detailed Sizing Analysis**: Re-evaluate story complexity:

   - Development effort estimation based on technical analysis
   - Testing and validation effort requirements
   - Integration and coordination overhead
   - Risk mitigation and spike work inclusion

2. **Sprint Capacity Assessment**: Validate sprint fit:

   - Compare refined scope against sprint capacity
   - Consider team availability and other sprint commitments
   - Account for technical risk and uncertainty buffers
   - Assess story completion confidence within sprint

3. **Story Splitting Identification**: Propose splitting if needed:
   - Identify logical value-preserving split points
   - Maintain user value in each split story
   - Ensure proper dependency ordering between splits
   - Validate split stories still follow INVEST principles

**Splitting Proposal Format:**
_"Based on detailed refinement analysis, Story [CODE] with [refined scope] would require approximately [X days] of development effort, which exceeds single sprint capacity. I recommend splitting this into two stories that maintain user value:_

**Story [CODE]-A: [Core Functionality]**

- _Delivers: [Essential user value]_
- _Effort: [Y days - fits in sprint]_
- _Acceptance Criteria: [Core criteria subset]_

**Story [CODE]-B: [Extended Functionality]**

- _Delivers: [Additional user value]_
- _Depends on: Story A completion_
- _Effort: [Z days - fits in future sprint]_
- _Acceptance Criteria: [Extended criteria]_

_This split enables incremental value delivery while maintaining manageable sprint scope. Does this splitting approach preserve the user value appropriately?"_

### Step 6: Cross-Functional Team Validation

**AI Assistant Instructions:** Facilitate team alignment and validation:

1. **Cross-Functional Review**: Validate story with all relevant team roles:

   - **Product**: Confirm acceptance criteria meet user value objectives
   - **Development**: Validate technical approach and effort estimates
   - **QA**: Confirm testing strategy and acceptance criteria testability
   - **UX/UI**: Validate user experience requirements and design alignment

2. **Dependency Coordination**: Confirm team coordination requirements:

   - Development role coordination and handoff points
   - Testing and validation coordination needs
   - External team dependencies and communication requirements
   - Timeline and milestone alignment with other work

3. **Risk Mitigation Validation**: Confirm risk management approach:
   - Technical risk mitigation strategies
   - Contingency plans for identified risks
   - Spike work scheduling and resource allocation
   - Escalation paths for blocked or complex issues

### Step 7: Story Documentation and Tool Updates

**AI Assistant Instructions:** Complete comprehensive story documentation:

1. **Comprehensive Story Documentation**: Update story with all refinement details:

   - Complete refined [template](.pair/knowledge/guidelines/collaboration/assets/user-story-template.md) with all analysis and requirements
   - Detailed acceptance criteria and technical specifications
   - Risk assessment and mitigation strategies
   - DoD checklist and validation requirements

2. **Tool Integration Updates**: Update project management tool:

   - **CRITICAL: Change story status to "Refined"** to indicate refinement completion and readiness for development
   - Update story points with refined estimates
   - Add technical notes and implementation details
   - Configure dependencies and team coordination metadata

3. **Sprint Planning Preparation**: Prepare story for sprint planning:
   - Validate story meets sprint planning requirements
   - Confirm story priority and scheduling alignment
   - Prepare story presentation for sprint planning session
   - Ensure all questions and uncertainties resolved

**Story Refinement Completion:**
_"User Story [STORY_CODE] refinement is complete and status updated to 'Refined'. The story now includes comprehensive acceptance criteria, detailed technical analysis, and validated sprint-readiness. Story effort is estimated at [X points] and fits within single sprint capacity [or has been split appropriately]. All refinement artifacts are documented and the story is ready for sprint planning selection and technical development."_

### Step 8: Refinement Quality Validation

**AI Assistant Instructions:** Validate refinement completeness and quality:

1. **Completeness Validation**: Ensure all refinement areas addressed:

   - All acceptance criteria specific and testable
   - Technical approach clearly defined
   - Risks identified and mitigation planned
   - Dependencies mapped and coordination planned

2. **Development Readiness Validation**: Confirm story ready for implementation:

   - No remaining ambiguity about expected outcomes
   - Technical approach understood and feasible
   - All external dependencies resolved or managed
   - Team alignment confirmed on scope and approach

3. **Quality Standards Validation**: Ensure refinement meets quality standards:
   - Story follows refined [template](.pair/knowledge/guidelines/collaboration/assets/user-story-template.md) completely
   - Acceptance criteria follow Given-When-Then format
   - Technical analysis addresses implementation concerns
   - DoD alignment ensures proper completion validation

## Refinement Quality Assurance Framework

### Story Refinement Quality Standards (Enhanced)

**Requirements Completeness:**

- [ ] All acceptance criteria specific, testable, and measurable with concrete examples
- [ ] Business rules clearly defined with validation criteria and edge case handling
- [ ] Edge cases and error handling scenarios comprehensively specified
- [ ] User experience and interaction requirements detailed with specific behaviors
- [ ] Data and integration requirements comprehensive with validation rules

**Technical Readiness:**

- [ ] Implementation approach clearly defined and technically feasible
- [ ] Technical risks identified with specific mitigation strategies
- [ ] Required spikes identified, scoped, and time-estimated
- [ ] Technical dependencies mapped with coordination requirements planned
- [ ] Performance and scalability requirements specified with measurable criteria
- [ ] Security requirements detailed with validation approaches

**Development Readiness:**

- [ ] Story sized appropriately for single sprint (or split with value preservation)
- [ ] DoD checklist complete and aligned with project standards
- [ ] Cross-functional team validation completed with sign-off
- [ ] All uncertainties and open questions resolved with documented decisions
- [ ] Story ready for immediate development start without additional clarification

**Sprint Execution Integration:**

- [ ] **Workflow Readiness**: Stories prepared for Story Kickoff → Task Breakdown → Task Iteration workflow
- [ ] **Autonomous Development**: Stories contain sufficient detail for autonomous task execution
- [ ] **Quality Gates**: All quality checkpoints clearly defined and measurable
- [ ] **Value Validation**: Story outcomes can be demonstrated and validated objectively

**Vertical Slicing Validation:**

- [ ] **Full-Stack Implementation**: Each refined story includes UI, business logic, and data persistence details
- [ ] **End-to-End Value**: Each story provides complete user functionality specification
- [ ] **Deployment Independence**: Each story can be deployed and tested independently
- [ ] **Layer Integration**: Stories properly specify integration across application layers

**Quality Validation:**

- [ ] Acceptance criteria follow Given-When-Then format
- [ ] Technical analysis addresses implementation approach
- [ ] Risk assessment comprehensive with mitigation plans
- [ ] Team coordination requirements clearly specified
- [ ] Documentation complete and tool integration updated

### Story Splitting Quality Standards

**Value Preservation:**

- [ ] Each split story delivers identifiable user value
- [ ] Split maintains logical user workflow progression
- [ ] Dependencies between split stories clearly defined
- [ ] Combined splits deliver original story value completely

**Sprint Readiness:**

- [ ] Each split story fits within single sprint capacity
- [ ] Split stories can be developed in logical sequence
- [ ] Technical dependencies properly managed across splits
- [ ] Each split story follows INVEST principles independently

## Best Practices for AI Assistants

### Do's:

- **Always analyze story context thoroughly** before beginning detailed refinement
- **Propose specific story candidates** with clear priority reasoning
- **Facilitate comprehensive requirements gathering** through structured questioning
- **Apply Given-When-Then format consistently** for all acceptance criteria
- **Conduct thorough technical analysis** to identify risks and approaches
- **Validate story size against sprint capacity** and propose splitting when needed
- **Ensure cross-functional team alignment** throughout refinement process
- **Document all refinement decisions** and reasoning comprehensively
- **Validate story development readiness** before marking refinement complete
- **Support developer-driven story selection** even if not highest priority

### Don'ts:

- **Never skip story context analysis** - understand current state and epic alignment first
- **Don't assume requirements without validation** - collaborate on all acceptance criteria
- **Don't ignore technical risks** - identify and plan mitigation for technical challenges
- **Don't allow oversized stories** - always validate sprint fit and split when necessary
- **Don't skip cross-functional validation** - ensure all team roles align on requirements
- **Don't leave ambiguity in acceptance criteria** - every criterion must be testable
- **Don't forget tool updates** - maintain project management tool with refined information
- **Don't rush refinement quality** - ensure comprehensive coverage of all refinement areas
- **Don't ignore dependencies** - map and coordinate all story dependencies
- **Don't finalize without DoD alignment** - ensure story completion criteria are clear

## Common Pitfalls and Solutions

| Pitfall                                   | Impact                                       | Solution                                                        |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Insufficient requirements detail**      | Development ambiguity and rework             | Use structured questioning to gather comprehensive criteria     |
| **Vague acceptance criteria**             | Testing difficulties and scope creep         | Apply Given-When-Then format with specific, measurable outcomes |
| **Missing technical analysis**            | Development risks and implementation blocks  | Conduct thorough technical review with risk identification      |
| **Oversized story scope**                 | Sprint capacity exceeded, delivery risk      | Validate size and split stories maintaining user value          |
| **Incomplete cross-functional alignment** | Team coordination issues and rework          | Facilitate validation with all relevant team roles              |
| **Overlooked edge cases**                 | Production issues and user frustration       | Systematically analyze edge cases and error scenarios           |
| **Missing dependency identification**     | Development blocks and coordination issues   | Map all story dependencies and coordination requirements        |
| **Inadequate DoD alignment**              | Inconsistent completion standards            | Align story DoD with project standards and quality requirements |
| **Poor story splitting decisions**        | Loss of user value or development complexity | Split on value boundaries maintaining logical user workflows    |
| **Rushed refinement process**             | Incomplete analysis and development risks    | Follow structured process ensuring comprehensive coverage       |

## Sprint Execution Integration

### Story Refinement to Sprint Execution Bridge

**Preparation for Sprint Execution Workflow:**

User story refinement must prepare stories for seamless integration with the **🛠️ Sprint Execution** workflow:

- **👨‍💻💡🤖 Story Kickoff Readiness**: Stories contain sufficient detail for immediate branch creation and development start
- **🤖🤝👨‍💻 Task Breakdown Preparation**: Clear scope boundaries enable effective task decomposition
- **🤖⚡ Task Iteration Readiness**: Comprehensive acceptance criteria support autonomous development capability
- **Quality Gate Integration**: Refined Definition of Done aligns with sprint execution quality checkpoints

### Workspace Setup Stories Integration

For initiatives requiring technical foundation setup, refined stories should integrate workspace configuration tracking through the complete execution workflow:

**Workspace Setup Story Characteristics:**

- Include technical environment configuration as measurable user-facing value
- Estimate setup time as part of project planning and capacity allocation
- Link workspace stories to feature stories that depend on them
- Track workspace completion through standard refinement-to-execution flow
- Integrate with **🛠️ Sprint Execution** quality gates and validation checkpoints

## Special Story Types in Refinement

### Bootstrap and Setup Stories (Epic 0)

When refining workspace setup and technical foundation stories:

**Value Definition**: Frame technical setup as user-facing value:

- "As a developer, I want a configured local development environment so that I can begin feature development efficiently"
- "As a team, we want automated CI/CD pipeline so that we can deploy changes reliably and quickly"

**Refinement Considerations**:

- Include specific environment configuration requirements
- Define measurable completion criteria for technical setup
- Link setup stories to dependent feature stories
- Estimate setup effort as part of sprint capacity planning
- Integrate setup validation with standard Definition of Done criteria

## References

**Foundation Documents:**

- `.pair/product/adopted/PRD.md` - User personas and detailed requirements context
- `.pair/way-of-working.md` - Development methodology and refinement ceremony definitions
- `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` - Project Management Tool Guidelines

**Technical Context:**

- `.pair/adoption/tech/architecture.md` - Technical implementation guidance and constraints
- `.pair/adoption/tech/tech-stack.md` - Technology choices affecting implementation approach
- `.pair/adoption/tech/ux-ui.md` - User experience standards for acceptance criteria
- `.pair/adoption/tech/way-of-working.md` - Development standards and DoD requirements

**Quality Standards:**

- Project Definition of Done standards
- Testing and validation requirements
- Code quality and review standards
- Documentation and compliance requirements

**Process Dependencies:**

- **Prerequisites**: Stories must be in backlog status from breakdown process
- **Input**: User stories with initial scope and rough sizing from breakdown
- **Output**: Development-ready stories with comprehensive acceptance criteria and technical analysis
- **Tool Integration**: Update project management tool with refined story information and ready status
- **State Management**: Update story status from "Todo" to "Refined" upon completion
- **Next Phase**: Stories ready for sprint planning and development execution

## State Management and Completion

### Final State Validation and Updates

**AI Assistant Instructions:** Complete the refinement process with proper state management:

1. **Verify Refinement Completion**: Confirm all refinement areas are thoroughly addressed
2. **Update Story Status**: Change story status from "Todo" to "Refined" to indicate readiness for task breakdown and development
3. **Update Epic Status**: Ensure parent epic status is properly maintained according to collaboration guidelines

**State Update Validation:**
_"✅ REFINEMENT COMPLETE: User Story '[STORY_ID]: [STORY_NAME]' has been fully refined with comprehensive acceptance criteria and technical analysis. Story status updated from 'Todo' to 'Refined'. The story is now ready for task breakdown following the **How to Create Tasks** process."_

**If Tool Cannot Update Status:**
_"⚠️ ACTION REQUIRED: Story refinement is complete, but I cannot update the story status in [TOOL_NAME]. Please manually:_
_1. Change User Story '[STORY_ID]' status from 'Todo' to 'Refined'_
_2. Verify all refinement details are properly captured in the project management tool_
_3. Ensure acceptance criteria and technical analysis are documented_
_Once updated, the story will be ready for task breakdown and development."_

**Related Documents:**

- Previous: [07-how-to-breakdown-user-stories.md](07-how-to-breakdown-user-stories.md)
- Bootstrap Checklist: [ 02-how-to-complete-bootstrap-checklist.md](02-how-to-complete-bootstrap-checklist.md)
- Next: [09-how-to-create-tasks.md](09-how-to-create-tasks.md)

This guide ensures a thorough, collaborative refinement process that transforms rough story concepts into comprehensive, development-ready specifications with detailed acceptance criteria, technical clarity, and validated sprint readiness.
