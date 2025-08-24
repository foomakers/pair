# How to Code Review - AI-Assisted Guide

## Overview

This guide enables Product Software Engineers and AI assistants to collaboratively conduct effective code reviews that ensure code quality, knowledge sharing, and maintainability standards across the development team. Code review validates **implemented code** from task implementation against established technical standards, architectural patterns, and story acceptance criteria.

**Key Benefits of Code Review:**

- Ensure implemented code meets established technical standards and architectural patterns
- Validate complete story acceptance criteria fulfillment with comprehensive testing coverage
- Maintain code quality through systematic validation of design patterns and conventions
- Enable knowledge sharing and continuous learning through collaborative review processes
- Identify technical debt, security vulnerabilities, and performance optimization opportunities
- Provide traceability from requirements through implementation to quality validation
- Facilitate continuous improvement of development practices and standards

**Important: Code reviews validate implementation against technical guidelines** - they represent the quality assurance phase where implemented code is systematically evaluated for compliance with established patterns, standards, and acceptance criteria.

## AI Assistant Role Definition

**Primary Role**: Product Software Engineer - Technical Quality Reviewer

The AI assistant acts as a **Product Software Engineer** serving as **Technical Quality Reviewer** who:

- **Analyzes** current git branch status and identifies implemented changes for review
- **Validates** code compilation and test execution before beginning review process
- **Identifies** user story and associated tasks from branch naming and implementation context
- **Reviews** implementation against story acceptance criteria and task specifications
- **Evaluates** code compliance with Definition of Done and established quality standards
- **Assesses** implementation adherence to technical adoption guidelines and architectural patterns
- **Documents** findings with specific issues, solutions, and improvement recommendations
- **Collaborates** with development team to integrate feedback and validate improvements
- **Tracks** review completion and identifies any remaining implementation gaps
- **Proposes** follow-up tasks for identified improvements following established implementation processes

**Working Principles**: Follow the **🤖🔍👨‍💻** model (AI reviews comprehensively, Developer validates and decides) throughout the entire code review process.

## Code Review Definition

### What is Code Review?

A **Code Review** is the **quality validation phase** where:

- **Validates Implementation**: Confirms implemented code meets story acceptance criteria and task specifications
- **Ensures Standards Compliance**: Verifies adherence to established technical adoption guidelines and architectural patterns
- **Assesses Code Quality**: Evaluates code against Definition of Done and established quality standards
- **Identifies Improvements**: Documents specific issues with proposed solutions and enhancement opportunities
- **Enables Knowledge Sharing**: Facilitates collaborative learning and continuous improvement processes
- **Maintains System Consistency**: Ensures implementation consistency with established technical decisions and patterns
- **Provides Quality Assurance**: Validates testing coverage, security standards, and performance requirements

**Code review is comprehensive and systematic** - it follows established quality validation workflows while maintaining consistency with technical guidelines and providing constructive feedback for continuous improvement.

### Review vs Other Development Phases

| Phase                   | Scope              | Purpose                                       | Detail Level                    |
| ----------------------- | ------------------ | --------------------------------------------- | ------------------------------- |
| **Task Implementation** | Code development   | Transform specifications into working code    | Code and tests                  |
| **Code Review**         | Quality validation | Validate implementation quality and standards | Code quality and compliance     |
| **Integration**         | System integration | Merge validated code into main system         | System consistency              |
| **Deployment**          | Production release | Deploy validated changes to production        | System deployment and operation |

---

**Project Management Tool Usage**

Before conducting code reviews, identify the configured project management tool as specified in `.pair/tech/adopted/way-of-working.md`. Access the tool using the provided credentials or links. Follow the usage and collaboration instructions in `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines.md` for interfacing, linking items, and managing review records. Please refer to this documentation any time the guide asks for project management tool actions.

---

## Review Quality Framework

### Core Review Principles for AI Assistants

**CRITICAL: Comprehensive Review Rules**

- **Standards Compliance**: All code must comply with technical standards as defined in [knowledge base guidelines](../../tech/knowledge-base/)
- **Story Validation**: Implementation must satisfy acceptance criteria as specified in [current sprint stories](../../product/backlog/03-user-stories/current-sprint/)
- **Quality Assurance**: Code must meet [Definition of Done](../../tech/knowledge-base/06-definition-of-done.md) requirements comprehensively
- **Architecture Consistency**: Implementation must follow patterns defined in [architectural guidelines](../../tech/knowledge-base/01-architectural-guidelines.md)
- **Testing Coverage**: Testing must meet standards defined in [testing strategy](../../tech/knowledge-base/07-testing-strategy.md)
- **Security Standards**: Security requirements as specified in [security guidelines](../../tech/knowledge-base/10-security-guidelines.md) must be validated
- **Performance Requirements**: Performance standards from [performance guidelines](../../tech/knowledge-base/09-performance-guidelines.md) must be assessed
- **Documentation Standards**: Documentation requirements as defined in [adoption documentation](../../tech/adopted/) must be met

### Review Session Management

**Review Process Types:**

1. **Technical Standards Review**:

   - Validate code against technical standards as defined in [tech stack adoption](../../tech/adopted/tech-stack.md) and [technical guidelines](../../tech/knowledge-base/03-technical-guidelines.md)
   - Assess architectural compliance per [architectural guidelines](../../tech/knowledge-base/01-architectural-guidelines.md) and [architecture adoption](../../tech/adopted/architecture.md)
   - Verify implementation standards adherence as specified in [code design guidelines](../../tech/knowledge-base/02-code-design-guidelines.md)
   - Evaluate infrastructure compliance per [infrastructure guidelines](../../tech/knowledge-base/04-infrastructure-guidelines.md) and [infrastructure adoption](../../tech/adopted/infrastructure.md)

2. **Story and Task Validation Review**:

   - Confirm story acceptance criteria fulfillment from [current sprint stories](../../product/backlog/03-user-stories/current-sprint/)
   - Validate task specification completion per [way-of-working](../../tech/adopted/way-of-working.md) task management requirements
   - Assess user story checklist completion and quality validation
   - Verify implementation completeness against defined specifications

3. **Quality Assurance Review**:
   - Evaluate [Definition of Done](../../tech/knowledge-base/06-definition-of-done.md) compliance with comprehensive quality metrics
   - Assess testing coverage per [testing strategy](../../tech/knowledge-base/07-testing-strategy.md) requirements
   - Validate security standards from [security guidelines](../../tech/knowledge-base/10-security-guidelines.md)
   - Review performance requirements per [performance guidelines](../../tech/knowledge-base/09-performance-guidelines.md)
   - Validate documentation requirements per adoption standards
   - Assess accessibility compliance per [accessibility guidelines](../../tech/knowledge-base/08-accessibility-guidelines.md)
   - Review observability requirements per [observability guidelines](../../tech/knowledge-base/11-observability-guidelines.md)

## Review Prerequisites

### Step 0: Development Status Analysis and Review Setup

**AI Assistant Instructions:** Begin with comprehensive git status analysis and review environment setup:

**Phase 0A: Git Environment Analysis**

1. **Analyze Current Git Status**: Check implementation branch and changes:

   Example (analyze project structure and tech stack from [tech-stack adoption](../../tech/adopted/tech-stack.md)):

   ```bash
   # Verify current branch and status
   git status
   git branch --show-current
   # Analyze recent commits and changes
   git log --oneline -10
   git diff main --name-only
   ```

   **Note**: Adapt git commands based on project branching strategy defined in [way-of-working](../../tech/adopted/way-of-working.md).

2. **Identify Implementation Branch**: Extract story information from branch naming:

   - Extract story code from branch name following established naming conventions from [way-of-working](../../tech/adopted/way-of-working.md)
   - If unable to identify current story from branch, check [assigned and in-progress stories](../../product/backlog/03-user-stories/current-sprint/) and propose the appropriate one
   - If no stories are assigned or in progress, ask user to specify which story to review
   - If no stories exist for review, explain that code review cannot proceed without a defined user story
   - Identify implementation scope and context from branch structure
   - Validate branch follows established naming patterns from [way-of-working](../../tech/adopted/way-of-working.md)
   - Confirm branch contains implementation changes ready for review

3. **Validate Development Environment**: Ensure review environment readiness:

   Example (adapt based on project tech stack from [tech-stack adoption](../../tech/adopted/tech-stack.md)):

   ```bash
   # Verify code compilation (example for Node.js project)
   pnpm run build  # or yarn build, or appropriate build command
   # Run test suite validation
   pnpm test       # or yarn test, or appropriate test command
   # Check linting and code quality
   pnpm run lint   # or yarn lint, or appropriate quality command
   ```

   **Note**: Analyze project structure and tech stack adoption to determine appropriate commands for your specific project.

**Phase 0B: Story and Task Context Loading**

4. **Load Story Context**: Identify and analyze user story from branch information:

   **Story Identification Process:**

   - Extract story ID from branch naming convention (e.g., `feature/US-123-user-authentication`)
   - Load story file from project management system (file system or external tool)
   - Analyze story acceptance criteria, description, and associated tasks
   - Review story checklist and completion requirements

5. **Load Task Context**: Analyze associated tasks for comprehensive validation:

   **Task Analysis Process:**

   - Identify all tasks associated with the story under review
   - Load task specifications, requirements, and completion checklists
   - Review task implementation scope and acceptance criteria
   - Analyze task dependencies and integration requirements

6. **Load Technical Context**: Reference complete technical foundation:

   **Foundation Documentation:**

   - Product requirements from [PRD.md](../../product/adopted/PRD.md)
   - Technical architecture from [architecture.md](../../tech/adopted/architecture.md)
   - Technology standards from [tech-stack.md](../../tech/adopted/tech-stack.md)
   - UX/UI guidelines from [ux-ui.md](../../tech/adopted/ux-ui.md)
   - Infrastructure requirements from [infrastructure.md](../../tech/adopted/infrastructure.md)
   - Working methodology from [way-of-working.md](../../tech/adopted/way-of-working.md)

   **Knowledge Base Guidelines:**

   - [Architectural guidelines and patterns](../../tech/knowledge-base/01-architectural-guidelines.md)
   - [Code design and quality standards](../../tech/knowledge-base/02-code-design-guidelines.md)
   - [Technical implementation standards](../../tech/knowledge-base/03-technical-guidelines.md)
   - [Infrastructure and deployment guidelines](../../tech/knowledge-base/04-infrastructure-guidelines.md)
   - [UX and design principles](../../tech/knowledge-base/05-ux-guidelines.md)
   - [Definition of Done criteria](../../tech/knowledge-base/06-definition-of-done.md)
   - [Testing strategy and coverage requirements](../../tech/knowledge-base/07-testing-strategy.md)
   - [Accessibility compliance standards](../../tech/knowledge-base/08-accessibility-guidelines.md)
   - [Performance optimization guidelines](../../tech/knowledge-base/09-performance-guidelines.md)
   - [Security implementation standards](../../tech/knowledge-base/10-security-guidelines.md)
   - [Observability and monitoring requirements](../../tech/knowledge-base/11-observability-guidelines.md)

**Phase 0C: Review Environment Validation**

7. **Validate Review Readiness**: Confirm environment preparation:

   **Environment Checks:**

   - [ ] **Code Compilation**: All code compiles successfully without errors
   - [ ] **Test Execution**: All tests pass with comprehensive coverage validation
   - [ ] **Quality Gates**: Linting and code quality checks pass established standards
   - [ ] **Story Context**: User story and task context successfully loaded
   - [ ] **Technical Standards**: All technical adoption guidelines and knowledge base loaded
   - [ ] **Review Tools**: Code review environment and tools properly configured

**Review Setup Confirmation:**
_"Code review environment ready for User Story '[STORY_ID]: [STORY_NAME]'. Branch '[BRANCH_NAME]' contains [X] commits with changes to [Y] files. All compilation and testing validation passed. Story context loaded with [Z] associated tasks. Technical standards and adoption guidelines loaded. Ready to begin comprehensive code review process."_

## Step-by-Step Review Process

### Step 1: Comprehensive Code Analysis

**AI Assistant Instructions:** Conduct systematic code analysis across all review dimensions:

**Phase 1A: Technical Standards Compliance Review**

1. **Architecture Pattern Validation**: Assess architectural consistency:

   **Architecture Review Checklist:**

   - [ ] **Design Patterns**: Implementation follows established architectural patterns
   - [ ] **Bounded Contexts**: Code respects defined bounded context boundaries
   - [ ] **Service Integration**: External service integration follows established patterns
   - [ ] **Data Access Patterns**: Database and data access follows architectural guidelines
   - [ ] **API Design**: API endpoints follow established design principles
   - [ ] **Event Handling**: Event-driven architecture patterns properly implemented
   - [ ] **Dependency Management**: Dependency injection and inversion of control properly applied
   - [ ] **Separation of Concerns**: Clear separation between layers and responsibilities

2. **Technology Standards Assessment**: Validate tech stack compliance:

   **Tech Stack Review Checklist:**

   - [ ] **Framework Usage**: Approved frameworks used correctly and consistently
   - [ ] **Library Dependencies**: Only approved libraries with specified versions used
   - [ ] **Language Standards**: Programming language best practices and conventions followed
   - [ ] **Build Configuration**: Build tools and configuration follow established standards
   - [ ] **Package Management**: Dependency management follows established patterns
   - [ ] **Version Consistency**: All dependencies use consistent versions across workspaces
   - [ ] **Configuration Management**: Environment and application configuration properly managed
   - [ ] **Tool Integration**: Development tools integrated according to adoption guidelines

3. **Infrastructure Compliance Validation**: Assess infrastructure alignment:

   **Infrastructure Review Checklist:**

   - [ ] **Deployment Patterns**: Code follows established deployment patterns and requirements
   - [ ] **Environment Configuration**: Proper environment variable and configuration management
   - [ ] **Resource Management**: Appropriate resource allocation and management patterns
   - [ ] **Scalability Considerations**: Implementation supports established scalability requirements
   - [ ] **Monitoring Integration**: Proper integration with monitoring and observability systems
   - [ ] **Health Check Implementation**: Health checks and system monitoring properly implemented
   - [ ] **Configuration Externalization**: Configuration properly externalized and managed
   - [ ] **Container Compliance**: Container and orchestration requirements properly addressed

**Phase 1B: Code Quality Assessment**

4. **Code Design and Structure Review**: Evaluate implementation quality:

   **Code Quality Review Checklist:**

   - [ ] **SOLID Principles**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
   - [ ] **DRY Principle**: Don't Repeat Yourself - code reuse and abstraction appropriately applied
   - [ ] **KISS Principle**: Keep It Simple, Stupid - implementation maintains appropriate simplicity
   - [ ] **Code Organization**: Logical file and directory structure following established conventions
   - [ ] **Naming Conventions**: Clear, descriptive, and consistent naming throughout codebase
   - [ ] **Function/Method Size**: Functions and methods maintain appropriate size and complexity
   - [ ] **Class Design**: Classes have appropriate responsibilities and maintain cohesion
   - [ ] **Error Handling**: Comprehensive and appropriate error handling throughout implementation

5. **Testing Coverage and Quality Validation**: Assess testing implementation:

   **Testing Review Checklist:**

   - [ ] **Test Coverage**: Comprehensive test coverage meeting established thresholds
   - [ ] **Test Quality**: Tests validate behavior, not implementation details
   - [ ] **Test Organization**: Tests well-organized with clear structure and naming
   - [ ] **Edge Case Coverage**: Edge cases and error conditions properly tested
   - [ ] **Integration Testing**: Integration points properly tested with appropriate coverage
   - [ ] **Performance Testing**: Performance-critical paths include appropriate testing
   - [ ] **Security Testing**: Security-sensitive functionality includes appropriate test coverage
   - [ ] **Test Maintainability**: Tests are maintainable and provide clear failure diagnostics

6. **Documentation and Code Clarity Review**: Evaluate documentation quality:

   **Documentation Review Checklist:**

   - [ ] **(Optional) Code Comments**: Inline comments explaining complex logic and decisions - only required if specified in [tech stack adoption](../../tech/adopted/tech-stack.md) or [code design guidelines](../../tech/knowledge-base/02-code-design-guidelines.md)
   - [ ] **API Documentation**: Public APIs documented with clear usage examples
   - [ ] **README Updates**: Project documentation updated to reflect changes
   - [ ] **Configuration Documentation**: Configuration changes properly documented
   - [ ] **Architecture Documentation**: Architectural decisions and patterns documented
   - [ ] **Deployment Documentation**: Deployment and operational changes documented
   - [ ] **Troubleshooting Guides**: Common issues and solutions documented
   - [ ] **Code Readability**: Code is self-documenting with clear intent and structure

### Step 2: Story and Task Validation

**AI Assistant Instructions:** Validate implementation against story requirements and task specifications:

**Phase 2A: Story Acceptance Criteria Validation**

1. **Acceptance Criteria Fulfillment Assessment**: Verify story completion:

   **Story Validation Process:**

   - **Load Story Acceptance Criteria**: Extract all acceptance criteria from story specification
   - **Map Implementation to Criteria**: Identify code changes that address each acceptance criterion
   - **Validate Completeness**: Confirm all acceptance criteria have corresponding implementation
   - **Assess Quality**: Evaluate implementation quality for each acceptance criterion
   - **Test Coverage Validation**: Verify test coverage for all acceptance criteria

   **Acceptance Criteria Review Matrix:**

   | Criteria ID | Description | Implementation Location | Test Coverage | Status  |
   | ----------- | ----------- | ----------------------- | ------------- | ------- |
   | AC-1        | [Criterion] | [Files/Functions]       | [Test Files]  | [✅/❌] |
   | AC-2        | [Criterion] | [Files/Functions]       | [Test Files]  | [✅/❌] |

2. **Story Checklist Completion Validation**: Assess story-level requirements:

   **Story Checklist Review:**

   - [ ] **Functional Requirements**: All functional requirements implemented and tested
   - [ ] **Non-Functional Requirements**: Performance, security, and usability requirements addressed
   - [ ] **Integration Requirements**: External system integration properly implemented
   - [ ] **User Experience Requirements**: UX/UI guidelines and patterns properly followed
   - [ ] **Data Requirements**: Data model and persistence requirements properly addressed
   - [ ] **Configuration Requirements**: Configuration and environment requirements addressed
   - [ ] **Documentation Requirements**: Required documentation created or updated
   - [ ] **Quality Requirements**: Code quality and maintainability standards met

**Phase 2B: Task Specification Compliance**

3. **Task Implementation Validation**: Verify task completion:

   **Task Review Process:**

   - **Load Task Specifications**: Extract detailed specifications for all story tasks
   - **Validate Task Completion**: Confirm each task specification fully implemented
   - **Assess Implementation Quality**: Evaluate quality of task-specific implementation
   - **Verify Task Dependencies**: Confirm task dependencies properly handled
   - **Validate Task Integration**: Assess integration between multiple task implementations

   **Task Completion Matrix:**

   | Task ID | Description | Specification Compliance | Quality Assessment | Integration Status |
   | ------- | ----------- | ------------------------ | ------------------ | ------------------ |
   | T-1     | [Task]      | [✅/❌/⚠️]               | [Rating/Issues]    | [✅/❌/⚠️]         |
   | T-2     | [Task]      | [✅/❌/⚠️]               | [Rating/Issues]    | [✅/❌/⚠️]         |

4. **Task Checklist Assessment**: Evaluate task-level quality requirements:

   **Task Quality Validation:**

   - [ ] **Implementation Completeness**: All task requirements fully implemented
   - [ ] **Technical Specification Adherence**: Implementation follows technical specifications exactly
   - [ ] **Quality Standards Compliance**: Code meets established quality standards for task
   - [ ] **Testing Requirements**: Task-specific testing requirements fulfilled
   - [ ] **Integration Points**: Task integration points properly implemented and tested
   - [ ] **Error Handling**: Appropriate error handling for task-specific scenarios
   - [ ] **Performance Considerations**: Task-specific performance requirements addressed
   - [ ] **Security Considerations**: Task-specific security requirements properly implemented

### Step 3: Quality Assurance Validation

**AI Assistant Instructions:** Conduct comprehensive quality validation against Definition of Done:

**Phase 3A: Definition of Done Compliance**

1. **Load and Apply Definition of Done**: Reference established quality criteria:

   **Definition of Done Validation Process:**

   - **Load DoD Criteria**: Extract all criteria from [Definition of Done](../../tech/knowledge-base/06-definition-of-done.md)
   - **Systematic Assessment**: Evaluate implementation against each DoD requirement
   - **Quality Metrics Validation**: Verify quantitative quality thresholds met
   - **Documentation Compliance**: Confirm documentation requirements satisfied
   - **Process Compliance**: Validate process requirements followed throughout implementation

2. **Quality Standards Assessment**: Evaluate comprehensive quality compliance:

   **Quality Review Checklist:**

   - [ ] **Code Quality Metrics**: Code complexity, maintainability, and readability standards met
   - [ ] **Test Coverage Thresholds**: Unit test, integration test, and overall coverage thresholds achieved
   - [ ] **Security Standards**: Security guidelines and vulnerability assessment standards met
   - [ ] **Performance Standards**: Performance benchmarks and optimization standards achieved
   - [ ] **Accessibility Compliance**: Accessibility guidelines and WCAG standards properly implemented
   - [ ] **Documentation Standards**: Code documentation, API documentation, and user documentation complete
   - [ ] **Review Process Compliance**: Code review process requirements fulfilled
   - [ ] **Continuous Integration**: CI/CD pipeline requirements and quality gates satisfied

**Phase 3B: Specialized Quality Reviews**

3. **Security Review Assessment**: Validate security implementation:

   **Security Review Checklist:**

   - [ ] **Authentication**: Authentication mechanisms properly implemented and tested
   - [ ] **Authorization**: Access control and permission systems correctly implemented
   - [ ] **Data Protection**: Sensitive data handling follows security guidelines
   - [ ] **Input Validation**: User input validation and sanitization properly implemented
   - [ ] **Cryptography**: Cryptographic implementations follow established standards
   - [ ] **Vulnerability Assessment**: Common vulnerability patterns avoided and tested
   - [ ] **Security Headers**: Appropriate security headers and configurations implemented
   - [ ] **Audit Logging**: Security-relevant events properly logged for audit trails

4. **Performance Review Assessment**: Validate performance implementation:

   **Performance Review Checklist:**

   - [ ] **Response Time Requirements**: API and user interface response times meet requirements
   - [ ] **Throughput Requirements**: System throughput and capacity requirements satisfied
   - [ ] **Resource Utilization**: CPU, memory, and storage utilization within acceptable limits
   - [ ] **Caching Strategy**: Appropriate caching implementation for performance optimization
   - [ ] **Database Performance**: Database queries and access patterns optimized
   - [ ] **Network Optimization**: Network usage and data transfer optimized
   - [ ] **Scalability Considerations**: Implementation supports scalability requirements
   - [ ] **Performance Monitoring**: Performance metrics and monitoring properly implemented

5. **Accessibility Review Assessment**: Validate accessibility compliance:

   **Accessibility Review Checklist:**

   - [ ] **WCAG Compliance**: Web Content Accessibility Guidelines properly followed
   - [ ] **Keyboard Navigation**: Full keyboard navigation support implemented
   - [ ] **Screen Reader Support**: Proper semantic markup and ARIA labels implemented
   - [ ] **Color Accessibility**: Color contrast and color-independent design implemented
   - [ ] **Focus Management**: Proper focus management and visual indicators implemented
   - [ ] **Alternative Text**: Images and media include appropriate alternative text
   - [ ] **Form Accessibility**: Forms include proper labels, instructions, and error handling
   - [ ] **Responsive Design**: Accessible across different devices and screen sizes

### Step 4: Issue Identification and Solution Proposal

**AI Assistant Instructions:** Document comprehensive findings with specific solutions:

**Phase 4A: Issue Categorization and Prioritization**

1. **Categorize Identified Issues**: Organize findings by severity and type:

   **Issue Categories:**

   - **Critical Issues**: Implementation gaps, security vulnerabilities, or architectural violations
   - **Major Issues**: Quality standard violations, incomplete requirements, or significant technical debt
   - **Minor Issues**: Code style violations, documentation gaps, or optimization opportunities
   - **Suggestions**: Best practice improvements, refactoring opportunities, or enhancement recommendations

2. **Issue Documentation Format**: Structure findings with actionable solutions:

   **Issue Documentation Template:**

   ```markdown
   ### [Issue Category] - [Issue Title]

   **File(s):** [Affected files and line numbers]
   **Severity:** [Critical/Major/Minor/Suggestion]
   **Category:** [Architecture/Quality/Security/Performance/Documentation/etc.]

   **Description:**
   [Clear description of the issue found]

   **Current Implementation:**
   [Code snippet or description of current implementation]

   **Standard/Requirement:**
   [Reference to specific standard, guideline, or requirement not met]

   **Proposed Solution:**
   [Specific solution with code examples or detailed steps]

   **Rationale:**
   [Why this solution addresses the issue and improves code quality]

   **Impact:**
   [Impact assessment of implementing the proposed solution]
   ```

**Phase 4B: Comprehensive Review Report Generation**

3. **Generate Initial Review Report**: Create comprehensive findings document:

   **Review Report Structure:**

   - **Executive Summary**: Overall assessment with key metrics and completion status
   - **Story Validation Results**: Acceptance criteria fulfillment and task completion assessment
   - **Technical Standards Compliance**: Architecture, tech stack, and infrastructure compliance results
   - **Quality Assurance Assessment**: Definition of Done and quality standards compliance
   - **Detailed Issues and Solutions**: Categorized issues with specific solutions and priorities
   - **Recommendations**: Improvement recommendations and next steps
   - **Approval Status**: Current approval status and remaining requirements

### Step 5: Collaborative Review Integration

**AI Assistant Instructions:** Collaborate with developer for review completion:

**Phase 5A: Initial Review Presentation**

1. **Present Review Findings**: Deliver comprehensive review results:

   _"Code review completed for User Story '[STORY_ID]: [STORY_NAME]' on branch '[BRANCH_NAME]'. Here's the comprehensive review report:_

   **📊 Review Summary:**

   - _Story Completion: [X/Y] acceptance criteria satisfied ([percentage]%)_
   - _Task Completion: [X/Y] tasks fully compliant ([percentage]%)_
   - _Quality Standards: [X/Y] DoD criteria met ([percentage]%)_
   - _Issues Identified: [X] Critical, [Y] Major, [Z] Minor, [W] Suggestions_

   **✅ Strengths Identified:**

   - _[List positive aspects and well-implemented features]_
   - _[Highlight adherence to standards and best practices]_
   - _[Acknowledge quality implementation areas]_

   **⚠️ Issues Requiring Attention:**

   _[Present categorized issues with solutions as documented]_

   **🔄 Next Steps:**

   - _Review and provide feedback on identified issues_
   - _Indicate which solutions to implement_
   - _Discuss any alternative approaches or considerations_

   _Please review these findings and let me know your thoughts, alternative approaches, or additional considerations to integrate into the final review assessment."_

2. **Collect Developer Feedback**: Integrate developer insights and decisions:

   **Feedback Integration Process:**

   - **Issue Prioritization**: Developer input on issue severity and implementation priority
   - **Solution Validation**: Developer assessment of proposed solutions and alternatives
   - **Implementation Approach**: Collaborative decision on implementation approach for fixes
   - **Standard Interpretation**: Clarification on standard application and interpretation
   - **Additional Considerations**: Developer insights on context, constraints, or requirements

**Phase 5B: Review Report Finalization**

3. **Update Review Report**: Integrate feedback and finalize assessment:

   **Updated Report Components:**

   - **Integrated Feedback**: Developer feedback and decisions incorporated
   - **Finalized Solutions**: Agreed-upon solutions with implementation approach
   - **Priority Assessment**: Final priority assessment for issue resolution
   - **Action Plan**: Specific action plan for issue resolution and implementation
   - **Approval Criteria**: Clear criteria for review completion and approval

4. **Present Final Review Assessment**: Deliver updated comprehensive review:

   _"Updated code review report incorporating your feedback and decisions:_

   **📋 Finalized Assessment:**

   _[Updated summary with integrated feedback]_

   **🎯 Confirmed Actions:**

   _[List of actions confirmed for implementation]_

   **⏸️ Deferred Items:**

   _[List of items deferred with rationale]_

   **📝 Implementation Plan:**

   _[Specific plan for addressing confirmed issues]_

   _Which of these confirmed actions would you like to proceed with? I can create specific tasks for any items requiring implementation following the established task creation and implementation processes."_

### Step 6: Task Creation and Implementation Coordination

**AI Assistant Instructions:** Coordinate follow-up tasks and implementation activities:

**Phase 6A: Task Creation for Review Findings**

1. **Generate Implementation Tasks**: Create specific tasks for confirmed improvements:

   **Task Creation Process:**

   - **Critical Issue Tasks**: High-priority tasks for critical issues requiring immediate attention
   - **Quality Improvement Tasks**: Tasks for major quality improvements and standard compliance
   - **Enhancement Tasks**: Tasks for minor improvements and optimization opportunities
   - **Technical Debt Stories**: For important but non-urgent improvements, create technical debt stories to be added to [product backlog](../../product/backlog/) for future planning
   - **Documentation Tasks**: Tasks for documentation updates and maintenance requirements

   **Task Documentation Format:**

   ```markdown
   ## Task: [Task Title from Review Finding]

   **Type:** Code Review Follow-up
   **Priority:** [Critical/High/Medium/Low based on issue severity]
   **Story:** [STORY_ID]: [STORY_NAME]
   **Review Issue Reference:** [Link to specific review finding]

   **Description:**
   [Clear description of task derived from review finding]

   **Acceptance Criteria:**

   - [ ] [Specific criterion addressing review issue]
   - [ ] [Quality validation requirement]
   - [ ] [Testing requirement if applicable]

   **Implementation Notes:**
   [Technical notes and solution approach from review]

   **Definition of Done:**

   - [ ] Implementation addresses review finding completely
   - [ ] Solution follows proposed approach from review
   - [ ] Appropriate testing coverage included
   - [ ] Code review validates issue resolution
   ```

2. **Update Project Management System**: Track review follow-up work:

   **Project Management Integration:**

   - **Task Creation**: Create tasks in project management system following established workflow
   - **Story Association**: Associate follow-up tasks with original story for traceability
   - **Priority Assignment**: Assign appropriate priority based on review issue severity
   - **Status Tracking**: Initialize task status according to established workflow
   - **Epic Updates**: Update parent epic status to reflect additional work if necessary

**Phase 6B: Implementation Process Coordination**

3. **Coordinate Implementation Process**: Guide follow-up implementation:

   _"Based on the confirmed review actions, I've created [X] follow-up tasks for implementation:_

   **📋 Created Tasks:**

   - _[TASK-ID]: [Task Title] - [Priority] - [Brief Description]_
   - _[TASK-ID]: [Task Title] - [Priority] - [Brief Description]_
   - _[Continue for all created tasks]_

   **🔄 Implementation Options:**

   **Option A: Immediate Implementation**
   _We can proceed immediately with implementing these tasks following the established TDD methodology from [10-how-to-implement-a-task.md](./10-how-to-implement-a-task.md). I'll handle the complete implementation process including test-driven development, quality validation, and progress tracking._

   **Option B: Task Queue Addition**
   _These tasks can be added to the current sprint or next sprint queue for prioritized implementation according to team capacity and sprint planning._

   **Option C: Developer Implementation**
   _You can implement these tasks independently using the established implementation guide, and I can provide review and validation support as needed._

   _Which implementation approach would you prefer for these review follow-up tasks?"_

4. **Handle Implementation Coordination**: Support chosen implementation approach:

   **Implementation Support Options:**

   - **Direct Implementation**: Guide through complete TDD implementation process
   - **Implementation Support**: Provide guidance and validation during developer implementation
   - **Queue Management**: Update sprint planning and task prioritization
   - **Progress Tracking**: Monitor implementation progress and provide status updates

### Step 7: Adoption and Standard Updates

**AI Assistant Instructions:** Handle adoption updates and standard modifications:

**Phase 7A: Adoption Compliance Assessment**

1. **Identify Adoption Gaps**: Assess implementation against adoption standards:

   **Adoption Analysis Process:**

   - **Standard Violations**: Identify implementation patterns that violate established adoptions
   - **Missing Standards**: Recognize areas where standards need clarification or extension
   - **Pattern Inconsistencies**: Find inconsistencies between adoption documents and implementation needs
   - **Emerging Patterns**: Identify new patterns that should be standardized

2. **Propose Adoption Updates**: Suggest modifications to adoption documents:

   _"During code review, I've identified several areas where our adoption standards may need updates or clarification:_

   **📋 Adoption Update Recommendations:**

   **[Adoption Document]: [Issue and Proposed Change]**

   - **Current Standard:** [Description of current adoption guideline]
   - **Implementation Challenge:** [Specific implementation issue encountered]
   - **Proposed Update:** [Specific change to adoption document]
   - **Rationale:** [Why this change improves development consistency and quality]

   _Would you like me to proceed with updating these adoption documents to better support consistent implementation across the development team?"_

**Phase 7B: Standard Modification Process**

3. **Update Adoption Documents**: Modify standards based on approved changes:

   **Adoption Update Process:**

   - **Document Modification**: Update specific adoption documents with approved changes
   - **Standard Integration**: Ensure updated standards integrate consistently across related documents
   - **Pattern Documentation**: Document new patterns and their application contexts
   - **Example Integration**: Add implementation examples to clarify updated standards
   - **Review Integration**: Update review checklists to include new standards

4. **Validate Adoption Updates**: Confirm updated standards address identified issues:

   **Validation Process:**

   - **Standard Consistency**: Verify updated standards maintain consistency across all adoption documents
   - **Implementation Clarity**: Confirm updated standards provide clear implementation guidance
   - **Review Integration**: Ensure code review processes include updated standard validation
   - **Team Communication**: Document changes for team awareness and training

### Step 8: Review Completion and Documentation

**AI Assistant Instructions:** Complete review process with comprehensive documentation:

**Phase 8A: Review Completion Validation**

1. **Validate Review Completeness**: Confirm comprehensive review completion:

   **Completion Checklist:**

   - [ ] **Story Validation**: All acceptance criteria and task specifications validated
   - [ ] **Technical Standards**: All adoption guidelines and knowledge base standards assessed
   - [ ] **Quality Assurance**: Definition of Done and quality requirements evaluated
   - [ ] **Issue Documentation**: All issues documented with specific solutions
   - [ ] **Developer Feedback**: Feedback integrated and decisions documented
   - [ ] **Task Creation**: Follow-up tasks created for confirmed improvements
   - [ ] **Adoption Updates**: Standard modifications completed for approved changes
   - [ ] **Documentation**: Review process and outcomes comprehensively documented
   - [ ] **Story Review Record**: Review findings and approval status documented in user story

2. **Document Review in User Story**: Record review completion in story:

   **Story Review Documentation:**

   ```markdown
   ## Code Review Completed

   **Review Date:** [DATE]
   **Reviewer:** AI Assistant + [DEVELOPER_NAME]
   **Final Status:** [APPROVED/APPROVED_WITH_CONDITIONS/REQUIRES_REWORK]

   **Review Summary:**

   - Story Completion: [X/Y] acceptance criteria satisfied ([percentage]%)
   - Quality Standards: [X/Y] DoD criteria met ([percentage]%)
   - Issues Identified: [X] Critical, [Y] Major, [Z] Minor resolved/addressed

   **Approval Decision:** [Detailed rationale for approval status]
   **Follow-up Actions:** [List of created tasks or technical debt stories]
   **Next Phase:** [Integration/Additional Implementation/Re-review]
   ```

3. **Generate Review Completion Report**: Document final review status:

   **Final Review Report:**

   - **Review Summary**: Complete assessment with final metrics and status
   - **Implementation Validation**: Story and task completion assessment
   - **Quality Assessment**: Standards compliance and quality validation results
   - **Issue Resolution**: Final issue status and resolution approach
   - **Follow-up Plan**: Created tasks and implementation coordination plan
   - **Standard Updates**: Adoption document changes and rationale
   - **Recommendations**: Process improvements and development recommendations

**Phase 8B: Process Handoff and Next Steps**

3. **Coordinate Next Phase Transition**: Prepare for subsequent development activities:

   **Process Transition Options:**

   **Option A: Implementation Complete and Approved**
   _If all review findings are resolved or accepted:_

   - Mark story as review-complete and ready for integration
   - Update project management status to reflect completion
   - Prepare branch for merge following established integration procedures
   - Document final implementation for knowledge sharing and future reference

   **Option B: Follow-up Implementation Required**
   _If review findings require additional implementation:_

   - Begin immediate task implementation following [10-how-to-implement-a-task.md](./10-how-to-implement-a-task.md)
   - Coordinate task prioritization and sprint planning integration
   - Continue review validation cycles for implemented improvements
   - Maintain development momentum with structured implementation approach

   **Option C: Standard Updates and Re-review**
   _If adoption standards were updated during review:_

   - Validate updated standards against current implementation
   - Re-assess implementation compliance with modified standards
   - Update review criteria and checklists for future reviews
   - Communicate standard changes to development team

4. **Provide Implementation Guidance**: Support chosen transition approach:

   _"Review process completed for User Story '[STORY_ID]: [STORY_NAME]'. Based on the comprehensive assessment:_

   **✅ Review Completion Status:**

   - _[X/Y] acceptance criteria fully satisfied_
   - _[X/Y] tasks meet specification requirements_
   - _[X/Y] quality standards achieved_
   - _[X] issues resolved, [Y] tasks created for remaining items_

   **🎯 Recommended Next Steps:**
   _[Specific recommendation based on review results]_

   **📋 Available Actions:**
   _1. Proceed with immediate task implementation for review findings_
   _2. Queue tasks for next sprint and complete story integration_
   _3. Create technical debt story for important but non-urgent improvements and add to backlog_
   _4. Request additional review cycles after implementing critical fixes_
   _5. Update sprint planning to accommodate additional work scope_

   _Which approach would you like to take for completing this story and addressing the review findings?"_

## Quality Assurance Framework

### Review Quality Standards

**Review Methodology Compliance:**

- [ ] **Comprehensive Coverage**: All code changes reviewed against complete standard set
- [ ] **Story Validation**: Complete story acceptance criteria and task specification validation
- [ ] **Technical Standards**: Full assessment against all adoption guidelines and knowledge base
- [ ] **Quality Metrics**: Quantitative quality assessment with established thresholds
- [ ] **Issue Documentation**: All issues documented with specific solutions and rationale
- [ ] **Priority Assessment**: Issues appropriately categorized and prioritized for resolution
- [ ] **Solution Quality**: Proposed solutions address root causes and maintain code quality
- [ ] **Developer Integration**: Developer feedback integrated and decisions documented

**Review Completeness Requirements:**

- [ ] **Architecture Compliance**: Implementation follows established architectural patterns and decisions
- [ ] **Technology Standards**: Uses approved technologies with consistent versions across workspaces
- [ ] **Code Quality**: Code meets established design and quality standards comprehensively
- [ ] **Testing Validation**: Testing coverage and quality meet established strategy requirements
- [ ] **Security Assessment**: Security guidelines and vulnerability assessments completed
- [ ] **Performance Evaluation**: Performance standards and optimization requirements assessed
- [ ] **Accessibility Validation**: Accessibility guidelines and compliance requirements evaluated
- [ ] **Documentation Review**: Code documentation and project documentation standards met

**Process Quality Assurance:**

- [ ] **Review Methodology**: Systematic review process followed with comprehensive coverage
- [ ] **Standard References**: All adoption guidelines and knowledge base standards referenced
- [ ] **Issue Traceability**: Issues traced to specific standards and requirements
- [ ] **Solution Validation**: Proposed solutions validated against standards and best practices
- [ ] **Developer Collaboration**: Effective collaboration and feedback integration throughout process
- [ ] **Documentation Quality**: Review documentation clear, actionable, and comprehensive
- [ ] **Follow-up Coordination**: Appropriate follow-up tasks and process coordination
- [ ] **Continuous Improvement**: Process improvements and learning opportunities identified

### Review Efficiency Guidelines

**Efficient Review Practices:**

- [ ] **Automated Validation**: Leverage automated tools for standard compliance checking
- [ ] **Focused Analysis**: Concentrate on high-impact areas and critical quality factors
- [ ] **Pattern Recognition**: Identify recurring patterns for process and standard improvements
- [ ] **Knowledge Reuse**: Apply lessons learned from previous reviews for efficiency
- [ ] **Tool Integration**: Use established development tools for comprehensive analysis
- [ ] **Metric Tracking**: Track review metrics for process improvement and optimization
- [ ] **Standard Evolution**: Continuously improve standards based on review findings
- [ ] **Team Learning**: Share review insights for team knowledge and skill development

## Best Practices for AI Assistants

### Review-Specific Do's:

- **Always analyze git status and environment** before beginning review process
- **Load complete technical context** including all adoption guidelines and knowledge base
- **Verify code compilation and test execution** before conducting review analysis
- **Extract story and task context** from branch naming and project management system
- **Conduct systematic review** against all established standards and quality criteria
- **Document issues with specific solutions** including code examples and detailed rationale
- **Categorize and prioritize issues** appropriately based on severity and impact
- **Integrate developer feedback** collaboratively and update review assessment accordingly
- **Create actionable follow-up tasks** for confirmed improvements and issue resolution
- **Coordinate with implementation process** for seamless transition to task execution
- **Update adoption standards** when gaps or improvements are identified and approved
- **Provide comprehensive documentation** for review outcomes and process improvement

### Review-Specific Don'ts:

- **Never begin review** without validating compilation and test execution success
- **Don't skip story context loading** - always understand requirements being validated
- **Never provide vague feedback** - always include specific solutions and examples
- **Don't ignore minor issues** - document all findings with appropriate categorization
- **Never impose solutions** without developer collaboration and decision integration
- **Don't skip adoption validation** - always assess against complete technical standard set
- **Never overlook testing quality** - validate both coverage and test implementation quality
- **Don't forget documentation assessment** - include code and project documentation in review
- **Never skip follow-up coordination** - ensure clear next steps and implementation support
- **Don't ignore process improvement** - identify and document process enhancement opportunities

### General Quality Principles:

- **Constructive Feedback**: Provide constructive, actionable feedback with clear improvement paths
- **Educational Approach**: Use review as learning opportunity for team skill development
- **Standard Consistency**: Maintain consistent application of standards across all reviews
- **Quality Focus**: Prioritize quality and maintainability over quick fixes or shortcuts
- **Collaborative Spirit**: Approach review as collaborative quality improvement process
- **Continuous Improvement**: Use review insights to improve processes and standards
- **Knowledge Sharing**: Document and share review learnings for team benefit
- **System Thinking**: Consider impact of changes on overall system architecture and design

## Common Review Pitfalls and Solutions

| Pitfall                                  | Impact                                                       | Solution                                                                   |
| ---------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Skipping environment validation**      | Reviewing non-functional code or missing critical errors     | Always verify compilation and test execution before review analysis        |
| **Incomplete context loading**           | Missing requirements validation and incorrect assessment     | Load complete story, task, and technical context before beginning review   |
| **Vague issue documentation**            | Unclear feedback that doesn't guide improvement              | Always provide specific issues with detailed solutions and examples        |
| **Missing adoption validation**          | Implementation inconsistencies and standard violations       | Systematically validate against all adoption guidelines and knowledge base |
| **Overlooking testing quality**          | Poor test coverage or ineffective testing strategies         | Assess both test coverage metrics and test implementation quality          |
| **Ignoring security considerations**     | Security vulnerabilities and compliance gaps                 | Include comprehensive security assessment in all reviews                   |
| **Missing performance assessment**       | Performance bottlenecks and scalability issues               | Evaluate performance against established standards and requirements        |
| **Inadequate documentation review**      | Poor maintainability and knowledge transfer                  | Include code and project documentation assessment in review process        |
| **Poor issue prioritization**            | Important issues overlooked or minor issues over-prioritized | Categorize issues appropriately based on impact and severity               |
| **Insufficient developer collaboration** | Solutions that don't fit context or constraints              | Integrate developer feedback and collaborate on solution development       |
| **Missing follow-up coordination**       | Review findings not translated into actionable improvements  | Create specific tasks and coordinate implementation process                |
| **Ignoring adoption gaps**               | Repeated standard violations and process inconsistencies     | Identify and propose adoption updates for improved consistency             |

## Review Session Examples

### Example 1: Critical Issue Identification and Resolution

**Issue:** Security vulnerability in user authentication

**Review Finding Documentation:**

````markdown
### Critical - Authentication Token Exposure

**File(s):** src/auth/authentication.ts:45-52
**Severity:** Critical
**Category:** Security

**Description:**
JWT tokens are being logged in plain text during authentication process, exposing sensitive authentication data in application logs.

**Current Implementation:**

```typescript
console.log("User authenticated with token:", token);
```
````

**Standard/Requirement:**
Security guidelines prohibit logging sensitive authentication data (Reference: [security guidelines](../../tech/knowledge-base/10-security-guidelines.md), Section 4.2)

**Proposed Solution:**

```typescript
// Remove token logging and implement secure audit logging
logger.audit("User authenticated", {
  userId: user.id,
  timestamp: new Date().toISOString(),
  // Never log actual token
});
```

**Rationale:**
This solution maintains audit trail for security monitoring while preventing token exposure in logs, following established security logging patterns.

**Impact:**
Eliminates security vulnerability while maintaining required audit capabilities for compliance and monitoring.

````

### Example 2: Architecture Pattern Compliance Review

**Issue:** Violation of established bounded context pattern

**Review Finding Documentation:**

```markdown
### Major - Bounded Context Violation

**File(s):** src/user/user-service.ts:23-35
**Severity:** Major
**Category:** Architecture

**Description:**
User service directly accessing order database entities, violating established bounded context boundaries between User and Order domains.

**Current Implementation:**
```typescript
// Direct database access across bounded contexts
const userOrders = await orderRepository.findByUserId(userId);
````

**Standard/Requirement:**
Bounded context guidelines require inter-context communication through established APIs (Reference: [bounded context](../../tech/adopted/boundedcontext/user-context.md))

**Proposed Solution:**

```typescript
// Use established Order API for cross-context communication
const userOrders = await orderApiClient.getUserOrders(userId);
```

**Rationale:**
This solution maintains bounded context isolation while providing required functionality through established API contracts.

**Impact:**
Preserves architectural integrity and enables independent bounded context evolution while maintaining required functionality.

````

### Example 3: Quality Improvement Recommendation

**Issue:** Test coverage below established threshold

**Review Finding Documentation:**

```markdown
### Minor - Test Coverage Enhancement

**File(s):** src/user/user-validation.ts
**Severity:** Minor
**Category:** Quality

**Description:**
User validation module has 78% test coverage, below established 85% threshold for business logic modules.

**Current Implementation:**
Missing test coverage for edge cases in email validation and error handling scenarios.

**Standard/Requirement:**
Testing strategy requires 85% coverage for business logic modules (Reference: [testing strategy](../../tech/knowledge-base/07-testing-strategy.md), Section 3.1)

**Proposed Solution:**
Add comprehensive test cases covering:
- Invalid email edge cases (empty, whitespace, special characters)
- Error handling scenarios (network failures, validation timeouts)
- Boundary conditions (maximum input lengths, unicode handling)

**Rationale:**
Enhanced test coverage improves code reliability and maintainability while meeting established quality thresholds.

**Impact:**
Improved code quality and reduced risk of production issues through comprehensive test validation.
````

## Review Documentation Standards

### Review Report Template

**Comprehensive Review Report Structure:**

```markdown
# Code Review Report: [STORY_ID] - [STORY_NAME]

## Review Summary

**Branch:** [BRANCH_NAME]
**Review Date:** [DATE]
**Reviewer:** AI Assistant + [DEVELOPER_NAME]
**Implementation Status:** [COMPLETE/PARTIAL/REQUIRES_FOLLOW_UP]

### Metrics Overview

| Metric            | Target | Actual | Status  |
| ----------------- | ------ | ------ | ------- |
| Story Completion  | 100%   | [X]%   | [✅/❌] |
| Task Completion   | 100%   | [X]%   | [✅/❌] |
| Test Coverage     | [X]%   | [Y]%   | [✅/❌] |
| Quality Standards | 100%   | [X]%   | [✅/❌] |

## Story Validation Results

### Acceptance Criteria Assessment

[AC-1]: [Description] - **Status:** [✅/❌/⚠️]

- **Implementation:** [Location and description]
- **Test Coverage:** [Test files and coverage]
- **Quality Assessment:** [Quality evaluation]

### Task Completion Analysis

[TASK-1]: [Description] - **Status:** [✅/❌/⚠️]

- **Specification Compliance:** [Assessment]
- **Quality Assessment:** [Quality evaluation]
- **Integration Status:** [Integration assessment]

## Technical Standards Compliance

### Architecture Review Results

- **Pattern Compliance:** [Assessment against architectural patterns]
- **Bounded Context Respect:** [Assessment of context boundary adherence]
- **Design Decision Consistency:** [Assessment against established ADRs]

### Technology Standards Assessment

- **Framework Usage:** [Assessment of framework compliance]
- **Library Dependencies:** [Assessment of approved library usage]
- **Version Consistency:** [Assessment of version alignment across workspaces]

### Infrastructure Compliance

- **Deployment Patterns:** [Assessment against deployment requirements]
- **Configuration Management:** [Assessment of configuration handling]
- **Monitoring Integration:** [Assessment of observability implementation]

## Quality Assurance Results

### Definition of Done Compliance

- **Code Quality:** [Assessment against quality standards]
- **Testing Coverage:** [Assessment of test coverage and quality]
- **Documentation:** [Assessment of documentation completeness]
- **Security:** [Assessment against security guidelines]
- **Performance:** [Assessment against performance requirements]
- **Accessibility:** [Assessment of accessibility compliance]

## Issues and Recommendations

### Critical Issues

[List critical issues with specific solutions]

### Major Issues

[List major issues with specific solutions]

### Minor Issues

[List minor issues with specific solutions]

### Suggestions

[List improvement suggestions and enhancement opportunities]

## Follow-up Actions

### Created Tasks

[List of tasks created for addressing review findings]

### Adoption Updates

[List of adoption document updates made or recommended]

### Implementation Plan

[Specific plan for addressing confirmed issues and improvements]

## Review Completion

**Final Status:** [APPROVED/APPROVED_WITH_CONDITIONS/REQUIRES_REWORK]
**Next Phase:** [Integration/Additional_Implementation/Re-review]
**Developer Sign-off:** [Pending/Completed]
```

### Review Progress Tracking

**Review Phase Indicators:**

```
Code Review Progress for [STORY_ID]

🔍 ANALYSIS: Environment Setup and Context Loading
   ✅ Git status analyzed and branch validated
   ✅ Code compilation and test execution verified
   ✅ Story and task context loaded
   ✅ Technical standards and adoption guidelines loaded

📋 VALIDATION: Standards and Requirements Assessment
   ✅ Story acceptance criteria validation completed
   ✅ Task specification compliance assessment completed
   ✅ Technical adoption guidelines assessment completed
   ✅ Quality assurance and DoD validation completed

📝 DOCUMENTATION: Issue Analysis and Solution Proposal
   ✅ Issues categorized and documented with solutions
   ✅ Developer feedback integrated and decisions recorded
   ✅ Review report finalized with action plan
   ✅ Follow-up tasks created for confirmed improvements

🎯 COMPLETION: Process Handoff and Next Steps
   ⏳ Final review status confirmation pending
   ⏳ Process transition coordination pending
   ⏳ Implementation guidance and support pending
```

## Version Consistency and Library Management in Reviews

### Version Consistency Validation During Review

**CRITICAL: Version Consistency Review Rules**

- **Mandatory Validation**: All reviews MUST include version consistency assessment across workspaces
- **Library Approval Check**: Verify ONLY approved libraries from adoption documentation are used
- **Version Alignment**: Confirm all dependencies use consistent versions across all workspaces
- **Unapproved Usage Detection**: Identify any unapproved library usage or version inconsistencies
- **Human Approval Required**: NEVER approve version differences or new libraries without explicit human approval
- **Technical Analysis Reference**: New library needs require reopening technical analysis following [09-how-to-create-tasks.md](./09-how-to-create-tasks.md)
- **Documentation Requirements**: All approved exceptions must be documented with detailed justification

**Version Review Process:**

1. **Workspace Consistency Analysis**: Compare versions across all project workspaces
2. **Approved Library Validation**: Verify against adoption documentation library lists
3. **Version Exception Documentation**: Check for documented version differences with justification
4. **New Library Detection**: Identify any libraries not listed in adoption documentation
5. **Human Approval Verification**: Confirm human approval for any version differences or new libraries
6. **ADR Documentation**: Verify Architectural Decision Records for significant changes
7. **Adoption Update Requirements**: Identify needs for adoption documentation updates

## Review Communication Framework

### Feedback Delivery Standards

**Constructive Feedback Principles:**

- **Specific and Actionable**: All feedback includes specific location, issue, and solution
- **Educational Focus**: Explain rationale and learning opportunities behind recommendations
- **Positive Recognition**: Acknowledge well-implemented features and adherence to standards
- **Solution-Oriented**: Always provide specific solutions rather than just identifying problems
- **Standard References**: Reference specific adoption guidelines and knowledge base sections
- **Impact Assessment**: Explain impact of issues and benefits of proposed solutions
- **Collaborative Tone**: Maintain collaborative and supportive communication throughout
- **Learning Opportunity**: Frame review as continuous improvement and skill development

### Developer Collaboration Protocol

**Collaborative Review Process:**

1. **Initial Findings Presentation**: Present comprehensive analysis with openness to feedback
2. **Discussion and Clarification**: Engage in technical discussion about findings and solutions
3. **Solution Refinement**: Collaboratively refine solutions based on context and constraints
4. **Priority Negotiation**: Work together to prioritize issues based on impact and effort
5. **Implementation Planning**: Coordinate implementation approach for approved improvements
6. **Standard Evolution**: Discuss potential improvements to adoption standards and processes
7. **Knowledge Sharing**: Share insights and learnings for team development and improvement

## Integration with Development Workflow

### Project Management Integration

**Project Management Tool Coordination:** Reference [way-of-working](../../tech/adopted/way-of-working.md) for:

**File System Tool Integration:**

- **Story Status Updates**: Update story files with review completion status and findings
- **Task Status Management**: Update task completion status based on review validation
- **Epic Progress Tracking**: Maintain epic progress status based on story review outcomes
- **Review Documentation**: Store review reports in appropriate project documentation structure

**External Tool Integration (Jira, etc.):**

- **Review Status Updates**: Update story and task status through appropriate tool APIs
- **Comment Integration**: Add review findings and action items through tool interface
- **Workflow Transition**: Trigger appropriate workflow transitions based on review outcomes
- **Reporting Integration**: Generate reports compatible with established project management reporting

### Git Workflow Integration

**Branch and Commit Management:**

- **Review Branch Validation**: Ensure review conducted on appropriate implementation branch
- **Commit History Analysis**: Assess commit quality and adherence to established standards
- **Merge Readiness Assessment**: Validate branch readiness for integration with main branch
- **Tag and Release Coordination**: Coordinate with release management processes for reviewed code

## Step-by-Step AI Assistant Review Process

### AI Assistant Review Execution Protocol

**Complete Review Process for AI Assistants:**

1. **Environment Analysis and Setup**:

   Example (adapt based on project structure and [tech stack adoption](../../tech/adopted/tech-stack.md)):

   ```bash
   # Analyze current git environment
   git status && git branch --show-current
   # Validate code compilation - adjust command based on tech stack
   pnpm run build  # or maven compile, gradle build, etc.
   # Execute test suite - adjust command based on testing framework
   pnpm test       # or mvn test, pytest, etc.
   # Run quality checks - adjust command based on linting tools
   pnpm run lint   # or eslint, sonar, etc.
   ```

   **Note**: Analyze project to determine appropriate commands from build configuration and tech stack adoption.

2. **Context Loading and Preparation**:

   - Extract story ID from branch name following naming conventions
   - Load story specification from project management system
   - Load associated task specifications and requirements
   - Load complete technical context from adoption and knowledge base

3. **Comprehensive Review Execution**:

   - Conduct technical standards compliance review
   - Validate story acceptance criteria and task specification compliance
   - Assess quality assurance against Definition of Done
   - Evaluate specialized areas (security, performance, accessibility)

4. **Issue Documentation and Solution Development**:

   - Document all findings with specific solutions and examples
   - Categorize and prioritize issues appropriately
   - Reference specific standards and guidelines for all findings
   - Develop actionable improvement recommendations

5. **Collaborative Review Integration**:

   - Present findings to developer with comprehensive analysis
   - Integrate developer feedback and refine solutions collaboratively
   - Update review assessment based on decisions and context
   - Finalize action plan and implementation coordination

6. **Follow-up Task Creation and Process Coordination**:

   - Create specific tasks for confirmed improvements
   - Update project management system with review outcomes
   - Coordinate implementation process for follow-up work
   - Update adoption standards if gaps identified and approved

7. **Review Completion and Documentation**:
   - Generate comprehensive review documentation
   - Validate review completeness against established criteria
   - Coordinate process transition to next development phase
   - Document lessons learned for process improvement

## Quality Gates and Approval Criteria

### Review Completion Gates

**Quality Gate Validation:**

- [ ] **Complete Analysis**: All code changes reviewed against comprehensive standard set
- [ ] **Issue Documentation**: All issues documented with specific solutions and priorities
- [ ] **Developer Collaboration**: Developer feedback integrated and decisions documented
- [ ] **Follow-up Planning**: Action plan created for addressing confirmed issues
- [ ] **Standard Validation**: Implementation validated against all adoption guidelines
- [ ] **Process Compliance**: Review process followed systematically and completely

**Approval Criteria Options:**

**✅ APPROVED**:

- All acceptance criteria satisfied
- All critical and major issues resolved
- Quality standards met comprehensively
- Ready for integration and deployment

**✅ APPROVED WITH CONDITIONS**:

- Core functionality satisfies acceptance criteria
- Minor issues documented with follow-up tasks
- Quality standards substantially met
- Integration approved with commitment to address conditions

**❌ REQUIRES REWORK**:

- Critical issues must be resolved before approval
- Story acceptance criteria not fully satisfied
- Quality standards not met adequately
- Additional implementation required before integration

### Review Metrics and Success Criteria

**Review Quality Metrics:**

- **Story Completion Rate**: Percentage of acceptance criteria fully satisfied
- **Task Compliance Rate**: Percentage of task specifications completely implemented
- **Standards Compliance Rate**: Percentage of technical standards fully met
- **Quality Gate Achievement**: Percentage of Definition of Done criteria satisfied
- **Issue Resolution Rate**: Percentage of identified issues with actionable solutions
- **Test Coverage Achievement**: Test coverage metrics against established thresholds
- **Security Compliance**: Security guideline adherence and vulnerability assessment
- **Performance Validation**: Performance requirement satisfaction and optimization assessment

## References

**Essential Files for AI Assistant:**

**Foundation Documents:**

- [Product vision, user personas, and requirements](../../product/adopted/PRD.md)
- [Development methodology and process definitions](../../tech/adopted/way-of-working.md)
- [Current sprint stories and tasks](../../product/backlog/03-user-stories/current-sprint/) (if the project management tool is filesystem)
- [Integration and merge procedures](../how-to/12-how-to-commit-and-push.md)
- `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines.md` - Collaboration and Process Guidelines

**Technical Context:**

- [System architecture patterns and design decisions](../../tech/adopted/architecture.md)
- [Technology choices and implementation standards](../../tech/adopted/tech-stack.md)
- [Infrastructure and deployment requirements](../../tech/adopted/infrastructure.md)
- [User interface patterns and interaction guidelines](../../tech/adopted/ux-ui.md)
- [Technical workflow and tool configuration](../../tech/adopted/way-of-working.md)

**Domain Context:**

- [Functional boundaries affecting review scope](../../product/adopted/subdomain/)
- [Technical boundaries affecting implementation validation](../../tech/adopted/boundedcontext/)

**Knowledge Base (Complete Technical Guidelines):**

### 🏗️ Architecture & Design

- **[01-architectural-guidelines.md](../../tech/knowledge-base/01-architectural-guidelines.md)** - System architecture patterns, bounded contexts, and ADR processes
- **[02-code-design-guidelines.md](../../tech/knowledge-base/02-code-design-guidelines.md)** - Code organization, design patterns, and implementation standards

### ⚙️ Technical Implementation

- **[03-technical-guidelines.md](../../tech/knowledge-base/03-technical-guidelines.md)** - Tech stack, development tools, and feature flag management
- **[04-infrastructure-guidelines.md](../../tech/knowledge-base/04-infrastructure-guidelines.md)** - Deployment strategies, environment management, and CI/CD

### 🎨 User Experience & Quality

- **[05-ux-guidelines.md](../../tech/knowledge-base/05-ux-guidelines.md)** - User experience standards and design principles
- **[06-definition-of-done.md](../../tech/knowledge-base/06-definition-of-done.md)** - Quality criteria and completion standards
- **[07-testing-strategy.md](../../tech/knowledge-base/07-testing-strategy.md)** - Testing frameworks, strategies, and quality gates

### 🔒 Security & Performance

- **[08-accessibility-guidelines.md](../../tech/knowledge-base/08-accessibility-guidelines.md)** - Accessibility standards and compliance requirements
- **[09-performance-guidelines.md](../../tech/knowledge-base/09-performance-guidelines.md)** - Performance optimization and monitoring strategies
- **[10-security-guidelines.md](../../tech/knowledge-base/10-security-guidelines.md)** - Security implementation and best practices
- **[11-observability-guidelines.md](../../tech/knowledge-base/11-observability-guidelines.md)** - Monitoring, logging, and tracing strategies

**Process Dependencies:**

- **Prerequisites**: Implemented code from task implementation ready for quality validation
- **Input**: Working code with comprehensive test coverage serves as review subject
- **Output**: Quality-validated code with improvement plan ready for integration process
- **Review Methodology**: All validation must follow comprehensive quality assessment practices
- **Standard References**: All review must validate against knowledge base and adoption guidelines
- **Version Consistency**: Maintain version alignment validation with human approval for exceptions
- **Next Phase**: Quality-validated code ready for **How to Commit and Push** process

**Related Documents:**

- Previous: [10-how-to-implement-a-task.md](./10-how-to-implement-a-task.md)
- Bootstrap Checklist: [02-how-to-complete-bootstrap-checklist.md](./02-how-to-complete-bootstrap-checklist.md)
- Next: [12-how-to-commit-and-push.md](./12-how-to-commit-and-push.md)

This guide ensures systematic, comprehensive code review that validates implementation quality against established technical standards while providing constructive feedback and coordinating improvement processes for continuous development excellence.
