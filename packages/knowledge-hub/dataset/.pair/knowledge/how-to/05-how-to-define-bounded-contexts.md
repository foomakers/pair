# How to Define Bounded Contexts

## Overview

This guide enables AI assistants to systematically identify and define bounded contexts within a Domain-Driven Design (DDD) architecture, transforming subdomain analysis and technical requirements into clear bounded context boundaries that drive service design, data model isolation, and team organization.

**Key Benefits:**

- Establishes precise bounded context boundaries based on subdomain analysis and technical architecture
- Creates structured bounded context definitions that guide microservices design and team boundaries
- Provides systematic approach to identify context relationships and integration patterns
- Ensures alignment between business subdomains and technical implementation boundaries
- Enables effective service isolation and data model consistency within contexts
- Maintains bounded context evolution as business requirements and technical architecture mature

## AI Assistant Role Definition

The AI assistant acts as a **Strategic Context Architect** with the following responsibilities:

- Analyze subdomain definitions and technical architecture to extract context boundaries
- Identify bounded context boundaries based on business cohesion, data consistency, and team autonomy
- Map relationships and integration patterns between bounded contexts
- Design context interfaces and anti-corruption layers for external dependencies
- Facilitate collaborative validation with developers to ensure implementation feasibility
- Generate comprehensive bounded context documentation that serves as foundation for service design
- Monitor subdomain evolution to maintain bounded context relevance and effectiveness

## **Issue Access and Tool Integration**

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks. NEVER deviate from this process.**

### **Access Protocol**

**Step 1: Tool Configuration Check**

1. **Read** [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:

_"I cannot proceed because no project management tool is configured in [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md). Complete bootstrap first: [How to Complete Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management/project-management-framework.md) for all access procedures
- **Use configured tool** as primary and authoritative source for all issue data

### **Validation Checklist**

- [ ] [way-of-working.md](.pair/adoption/tech/way-of-working.md) read and tool identified
- [ ] Tool configured (if not: halt and request bootstrap)
- [ ] [Project Management Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management/project-management-framework.md) consulted for access procedures

## Step-by-Step Implementation Process

### Step 1: Technical and Business Context Analysis

**Objective**: Extract context boundaries from existing subdomain analysis and technical architecture.

**Process**:

1. **Analyze Subdomain Foundation**:

   - Read all files under [`.pair/product/adopted/subdomain/`](.pair/adoption/product/subdomain) thoroughly
   - Extract subdomain classifications (core, supporting, generic) and relationships
   - Identify business capabilities and strategic importance
   - Note subdomain dependencies and data flow patterns

2. **Review Technical Architecture**:

   - Examine [`.pair/adoption/tech/architecture.md`](.pair/adoption/tech/architecture.md) for system structure
   - Review [`.pair/adoption/tech/tech-stack.md`](.pair/adoption/tech/tech-stack.md) for technology constraints
   - Analyze [`.pair/adoption/tech/infrastructure.md`](.pair/adoption/tech/infrastructure.md) for deployment patterns
   - Consider [`.pair/adoption/tech/ux-ui.md`](.pair/adoption/tech/ux-ui.md) for user interface boundaries

3. **Understand Organizational Context**:

   - Review [`.pair/adoption/tech/way-of-working.md`](.pair/adoption/tech/way-of-working.md)
   - Understand team structure and communication patterns
   - Identify development phases and delivery expectations
   - Consider operational and maintenance requirements

4. **Validate Business Requirements**:
   - Cross-reference [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md)
   - Review all initiatives in [`.pair/adoption/product/backlog/01-initiatives/`](.pair/adoption/product/backlog/01-initiatives/)
   - Ensure context boundaries support business objectives
   - Identify compliance and integration requirements

### Step 2: Initial Bounded Context Identification

**AI Assistant Instructions:** Analyze subdomains and propose initial bounded context catalog:

**Process**:

1. **Present comprehensive bounded context analysis:**

_"Based on my analysis of your subdomain model, technical architecture, and business requirements, I've identified the following preliminary bounded context catalog:_

## **PROPOSED BOUNDED CONTEXT CATALOG**

### **Core Business Contexts** (High autonomy, business differentiation)

_1. **[Core Context 1]** - [One-line business purpose]_

- **Subdomains**: [Subdomain A], [Subdomain B]
- **Business Focus**: [Key business capability]
- **Team Autonomy**: High - Independent development and deployment

_2. **[Core Context 2]** - [One-line business purpose]_

- **Subdomains**: [Subdomain C]
- **Business Focus**: [Key business capability]
- **Team Autonomy**: High - Independent development and deployment

### **Supporting Business Contexts** (Medium autonomy, operational efficiency)

_3. **[Supporting Context 1]** - [One-line business purpose]_

- **Subdomains**: [Supporting Subdomain A], [Supporting Subdomain B]
- **Business Focus**: [Operational capability]
- **Team Autonomy**: Medium - Some coordination required

_4. **[Supporting Context 2]** - [One-line business purpose]_

- **Subdomains**: [Supporting Subdomain C]
- **Business Focus**: [Operational capability]
- **Team Autonomy**: Medium - Some coordination required

### **Shared Infrastructure Contexts** (Low autonomy, technical services)

_5. **[Infrastructure Context 1]** - [One-line technical purpose]_

- **Subdomains**: [Generic Subdomain A]
- **Technical Focus**: [Shared technical capability]
- **Team Autonomy**: Low - Centralized platform team

_6. **[Infrastructure Context 2]** - [One-line technical purpose]_

- **Subdomains**: [Generic Subdomain B], [Generic Subdomain C]
- **Technical Focus**: [Shared technical capability]
- **Team Autonomy**: Low - Centralized platform team

## **BOUNDED CONTEXT RELATIONSHIPS**

### **Context Integration Patterns**

| From Context   | To Context         | Integration Pattern                | Data Consistency  | Communication |
| -------------- | ------------------ | ---------------------------------- | ----------------- | ------------- |
| [Core A]       | [Core B]           | [Event-Driven/API/Shared Database] | [Eventual/Strong] | [Async/Sync]  |
| [Core A]       | [Supporting A]     | [Request-Response/Event]           | [Eventual]        | [Sync/Async]  |
| [Supporting A] | [Infrastructure A] | [Shared Service/API]               | [Strong]          | [Sync]        |

### **Anti-Corruption Layer Requirements**

_- **[Core Context A] ↔ [External System]**: [Protection strategy]_
_- **[Supporting Context B] ↔ [Legacy System]**: [Translation approach]_
_- **[Infrastructure Context] ↔ [Third-Party Service]**: [Isolation mechanism]_

### **Data Ownership and Boundaries**

_- **[Context A] Data Ownership**: [Key entities and aggregates]_
_- **[Context B] Data Ownership**: [Key entities and aggregates]_
_- **Shared Data Concerns**: [Cross-context data synchronization needs]_

_This catalog represents my understanding based on your subdomain model and technical architecture. Please review:_

_1. **Context Granularity**: Are the bounded contexts at the right size for your teams and business needs?_
_2. **Subdomain Grouping**: Do the subdomain-to-context mappings make sense for business cohesion?_
_3. **Integration Patterns**: Do the proposed relationships match your technical constraints and performance requirements?_
_4. **Team Alignment**: Do the contexts align with your current or desired team structure?_
_5. **Missing Contexts**: Are there business or technical areas not adequately covered?_

_What changes would you make to this bounded context catalog?"_

### Step 3: Bounded Context Catalog Validation and Refinement

**AI Assistant Instructions:** Iterate on the catalog until developer approves the complete context landscape:

**Process**:

1. **Handle catalog feedback systematically:**

_"Based on your feedback, I'll update the bounded context catalog:_

**CHANGES REQUESTED**:
_- **Add Context**: [New Context] - [Rationale for addition]_
_- **Remove Context**: [Context to remove] - [Rationale for removal]_
_- **Merge Contexts**: [Context A] + [Context B] → [New Combined Context]_
_- **Split Context**: [Original Context] → [New Context 1] + [New Context 2]_
_- **Reassign Subdomains**: [Subdomain X] moved from [Old Context] to [New Context]_

**INTEGRATION UPDATES**:
_- **New Integration**: [Context X] ↔ [Context Y] via [Pattern] - [Reason]_
_- **Modified Pattern**: [Context A] ↔ [Context B] changed from [Old Pattern] to [New Pattern]_
_- **Removed Integration**: [Previous integration no longer needed]_

**TEAM ALIGNMENT ADJUSTMENTS**:
_- **Team Ownership**: [Context] assigned to [Team] - [Rationale]_
_- **Shared Ownership**: [Context] managed by [Primary Team] with support from [Secondary Team]_

## **UPDATED BOUNDED CONTEXT CATALOG**

[Present complete revised catalog with all changes incorporated]

_Does this updated catalog accurately represent your desired context boundaries and team structure? Are there any other adjustments needed before we proceed to detailed context definitions?"_

2. **Continue refinement until approval:**

_"I want to confirm we have agreement on the complete bounded context landscape before moving to detailed definitions:_

## **FINAL BOUNDED CONTEXT SUMMARY**

**Total Contexts**: [X] ([Y] Core Business, [Z] Supporting Business, [W] Shared Infrastructure)

**Context-to-Subdomain Mapping**:
_- **Core Contexts** cover [X] core subdomains_
_- **Supporting Contexts** cover [Y] supporting subdomains_
_- **Infrastructure Contexts** cover [Z] generic subdomains_

**Integration Complexity**:
_- **[X] Synchronous integrations** (strong consistency requirements)_
_- **[Y] Asynchronous integrations** (eventual consistency acceptable)_
_- **[Z] Anti-corruption layers** (external system protection)_

**Team Alignment**:
_- **[X] Independent teams** (full context ownership)_
_- **[Y] Coordinated teams** (shared context responsibility)_
_- **[Z] Platform teams** (infrastructure context management)_

_Is this the definitive bounded context catalog we should use for detailed analysis? Once confirmed, I'll proceed to create comprehensive definitions for each bounded context."_

### Step 4: Individual Bounded Context Detailed Definition

**AI Assistant Instructions:** Only after catalog approval, develop detailed specifications for each bounded context:

**Process**:

1. **Define each bounded context systematically:**

_"Now I'll create detailed definitions for each approved bounded context. Starting with [Core Context 1]:_

## **[BOUNDED CONTEXT NAME]** (Core Business)

### **Business Scope and Purpose**

**Primary Business Capability**: [Core business function this context serves]
**Strategic Importance**: [Why this context is critical for business differentiation]
**User Value**: [Direct value delivered to end users]

### **Subdomain Coverage**

**Included Subdomains**:
_- **[Subdomain A]**: [Role within this context]_
_- **[Subdomain B]**: [Role within this context]_

**Business Cohesion Rationale**: [Why these subdomains belong together]
**Change Frequency**: [How often this context's requirements change together]

### **Data Model and Ownership**

**Core Entities and Aggregates**:
_- **[Aggregate 1]**: [Business entities and rules]_
_- **[Aggregate 2]**: [Business entities and rules]_

**Data Consistency Requirements**: [Strong vs. eventual consistency needs]
**Storage Patterns**: [Database per service, shared database, event sourcing]

### **Service Boundaries**

**Internal Services**:
_- **[Service A]**: [Responsibility and scope]_
_- **[Service B]**: [Responsibility and scope]_

**Public Interface**:
_- **Commands**: [What this context can do for others]_
_- **Queries**: [What data this context can provide]_
_- **Events**: [What business events this context publishes]_

### **Integration Patterns**

**Upstream Dependencies** (this context depends on):
_- **[Context X]** via [Integration Pattern]: [Data/services consumed]_

**Downstream Dependencies** (depends on this context):
_- **[Context Y]** via [Integration Pattern]: [Data/services provided]_

**Anti-Corruption Layers**:
_- **[External System]**: [Protection and translation strategy]_

### **Team and Development Recommendations**

**Team Structure**: [Recommended team size and composition]
**Development Autonomy**: [Level of independence from other teams]
**Deployment Strategy**: [Independent vs. coordinated deployment]
**Technology Ownership**: [Technology stack decisions and constraints]

### **Quality Attributes**

**Performance Requirements**: [Response time, throughput expectations]
**Scalability Needs**: [Growth patterns and scaling strategies]
**Reliability Expectations**: [Availability requirements and fault tolerance]
**Security Considerations**: [Authentication, authorization, data protection]

_Does this definition accurately capture [Context Name]'s role in your system architecture and business model?"_

2. **Continue with systematic validation for supporting contexts:**

_"Moving to [Supporting Context 1]:_

## **[BOUNDED CONTEXT NAME]** (Supporting Business)

### **Business Scope and Purpose**

**Supporting Function**: [How this context enables core business operations]
**Operational Focus**: [Efficiency, compliance, or process optimization]
**Internal Value**: [Value delivered to other contexts or internal users]

### **Subdomain Coverage and Integration Strategy**

**Included Subdomains**: [List with operational focus]
**Standardization Opportunities**: [Areas for process optimization]
**Coordination Requirements**: [Dependencies with core contexts]

### **Service Design and Interface**

**Service Architecture**: [Monolithic vs. microservices approach]
**Shared Services**: [Common services used by multiple contexts]
**Configuration Management**: [Centralized vs. distributed configuration]

_This supporting context focuses on operational efficiency while serving core business contexts. Does this assessment align with your architectural vision?"_

3. **Complete infrastructure contexts:**

_"Final context type - [Infrastructure Context 1]:_

## **[BOUNDED CONTEXT NAME]** (Shared Infrastructure)

### **Technical Scope and Purpose**

**Infrastructure Function**: [Shared technical capability provided]
**Platform Services**: [Common technical services offered]
**Cross-Cutting Concerns**: [Security, monitoring, configuration, etc.]

### **Service Strategy**

**Build vs. Buy Analysis**: [Recommendation for implementation approach]
**Vendor Integration**: [External service integration patterns]
**Platform Team Ownership**: [Centralized management and support]

### **Consumer Integration**

**Service Consumers**: [Which contexts use these infrastructure services]
**API Design**: [Stable interfaces for infrastructure services]
**SLA Requirements**: [Service level expectations for consumers]

_This infrastructure context should minimize custom development and focus on operational excellence. Do you agree with this approach?"_

### Step 5: Comprehensive Integration Pattern Validation

**AI Assistant Instructions:** Validate all bounded context integrations with detailed definitions:

**Process**:

1. **Present complete integration architecture:**

_"With all bounded contexts defined, let me validate the complete integration architecture:_

## **COMPREHENSIVE INTEGRATION ARCHITECTURE**

### **Synchronous Integration Patterns**

| From Context | To Context         | Pattern  | Use Case             | Consistency | Performance Impact |
| ------------ | ------------------ | -------- | -------------------- | ----------- | ------------------ |
| [Core A]     | [Supporting B]     | REST API | [Business operation] | Strong      | Medium latency     |
| [Core B]     | [Infrastructure A] | gRPC     | [Technical service]  | Strong      | Low latency        |

### **Asynchronous Integration Patterns**

| Publisher      | Subscriber | Event Type      | Business Trigger     | Consistency | Retry Strategy   |
| -------------- | ---------- | --------------- | -------------------- | ----------- | ---------------- |
| [Core A]       | [Core B]   | [BusinessEvent] | [Business condition] | Eventual    | [Retry approach] |
| [Supporting A] | [Core B]   | [ProcessEvent]  | [Process completion] | Eventual    | [Retry approach] |

### **Anti-Corruption Layer Architecture**

| Protected Context | External System   | Protection Strategy | Translation Approach | Failure Handling    |
| ----------------- | ----------------- | ------------------- | -------------------- | ------------------- |
| [Core A]          | [Legacy System]   | [ACL Pattern]       | [Data mapping]       | [Fallback strategy] |
| [Supporting B]    | [Third-Party API] | [Gateway Pattern]   | [Format conversion]  | [Circuit breaker]   |

### **Data Consistency Boundaries**

**Strong Consistency Requirements**:
_- **[Context A] ↔ [Context B]**: [Critical business operations requiring immediate consistency]_

**Eventual Consistency Acceptable**:
_- **[Context C] ↔ [Context D]**: [Background processes and analytics]_

**Compensation Patterns**:
_- **[Integration Point]**: [Saga pattern for distributed transactions]_

### **Critical Integration Dependencies**

**High-Risk Integrations** (require careful monitoring):
_- **[Context A] → [Context B]**: [Risk factors and mitigation]_

**Performance Bottlenecks** (may need optimization):
_- **[Service X]**: [Potential scaling concerns]_

**Single Points of Failure** (require redundancy):
_- **[Infrastructure Service]**: [Backup strategies]_

_Does this integration architecture accurately represent how your system should operate? Are there missing patterns, incorrect assumptions, or integration risks I haven't addressed?"_

### Step 6: Bounded Context Document Generation

**AI Assistant Instructions:** Create comprehensive bounded context documentation, including a context index.

**Process**:

1. **Generate complete structured document:**

_"I'll now create the complete bounded context document incorporating all validated definitions and integration patterns:_

## **DOCUMENT STRUCTURE**

**Executive Summary**: [Business and technical context overview]
**Bounded Context Catalog**: [Complete approved listing with subdomain mappings]
**Detailed Context Definitions**: [All context specifications with business and technical details]
**Integration Architecture**: [Complete integration patterns and anti-corruption layers]
**Implementation Strategy**: [Phased approach, team assignments, and technology recommendations]
**Evolution Guidelines**: [How to maintain bounded context model as system grows]

_The document will follow our adopted standards format (concise, prescriptive, English) and serve as authoritative context for service design, team organization, and system architecture decisions._

_For the output, I will generate a separate file for each bounded context under the folder [`.pair/adoption/tech/boundedcontext/`](.pair/adoption/tech/boundedcontext), creating the folder if it does not exist, with all validated content. Each bounded context will be saved in its own file (e.g., `.pair/adoption/tech/boundedcontext/<context-name>.md`)._

_Additionally, I will generate a `README.md` file in the same folder. This file will contain a list of all bounded contexts, each with a link to its file and a brief description. The README.md will serve as an index and quick reference for the bounded context documentation._

_The README.md will also be submitted for developer review and must be revised according to any feedback, following the same validation process as the context catalog and definitions._

_Should I proceed to generate the individual bounded context files and the README.md index in [`.pair/adoption/tech/boundedcontext/`](.pair/adoption/tech/boundedcontext)?"_

### Step 7: Implementation Strategy and Team Alignment

**AI Assistant Instructions:** Provide comprehensive implementation guidance:

**Process**:

1. **Present implementation roadmap:**

_"Here's the recommended implementation strategy based on your bounded context architecture:_

## **BOUNDED CONTEXT IMPLEMENTATION STRATEGY**

### **Development Phases**

**Phase 1: Core Business Contexts** ([X] contexts - [Y] sprints)
_- **[Core Context A]**: [Implementation priority and rationale]_
_- **[Core Context B]**: [Implementation priority and rationale]_
_- **Dependencies**: [Critical integrations to establish first]_

**Phase 2: Supporting Business Contexts** ([X] contexts - [Y] sprints)
_- **[Supporting Context A]**: [Implementation approach]_
_- **[Supporting Context B]**: [Implementation approach]_
_- **Integration Points**: [Key connections to core contexts]_

**Phase 3: Infrastructure Contexts** ([X] contexts - [Y] sprints)
_- **[Infrastructure Context A]**: [Build vs. buy decision]_
_- **[Infrastructure Context B]**: [Platform service establishment]_

### **Team-to-Context Mapping**

| Bounded Context          | Primary Team    | Team Size | Key Skills Required | Autonomy Level       |
| ------------------------ | --------------- | --------- | ------------------- | -------------------- |
| [Core Context A]         | [Team Name]     | [Size]    | [Skills]            | High - Independent   |
| [Supporting Context B]   | [Team Name]     | [Size]    | [Skills]            | Medium - Coordinated |
| [Infrastructure Context] | [Platform Team] | [Size]    | [Skills]            | Low - Shared         |

### **Technology and Architecture Decisions**

**Service Architecture per Context**:
_- **[Context A]**: [Microservices/Modular Monolith] - [Rationale]_
_- **[Context B]**: [Architecture choice] - [Rationale]_

**Data Architecture per Context**:
_- **[Context A]**: [Database per service/Shared database] - [Rationale]_
_- **[Context B]**: [Data strategy] - [Rationale]_

**Integration Technology Stack**:
_- **Synchronous**: [REST/gRPC/GraphQL] - [Use cases]_
_- **Asynchronous**: [Event streaming/Message queues] - [Use cases]_
_- **Anti-Corruption**: [API Gateway/Service mesh/Custom] - [Protection needs]_

_Does this implementation strategy align with your team structure, timeline, and technical constraints?"_

### Step 8: Final Document and README.md Review and Storage

**AI Assistant Instructions:** Present the complete bounded context documentation and the README.md index for approval.

**Process**:

1. **Present complete document and README.md summary:**

_"Here's the final bounded context document summary and the generated README.md index:_

## **BOUNDED CONTEXT ARCHITECTURE RESULTS**

**Total Contexts**: [X] ([Y] Core, [Z] Supporting, [W] Infrastructure)

**Key Architectural Decisions**:
_- **Context Granularity**: [Right-sized for team ownership]_
_- **Integration Strategy**: [Balance of sync/async patterns]_
_- **Data Consistency**: [Strong consistency where critical, eventual elsewhere]_
_- **Anti-Corruption**: [Protection from external dependencies]_

**Implementation Impact**:
_- **Service Design**: [X] independent services across contexts_
_- **Team Structure**: [Y] autonomous teams with clear ownership_
_- **Data Architecture**: [Database strategies per context]_
_- **Integration Complexity**: [Managed through well-defined patterns]_

**Business Alignment**:
_- **Core Contexts**: [Support key business differentiators]_
_- **Supporting Contexts**: [Enable operational excellence]_
_- **Infrastructure Contexts**: [Provide technical foundation]_

_The documentation and the README.md index will be presented for developer review. The README.md must be revised according to any feedback, and the process will iterate until the developer approves both the bounded context files and the README.md index._

_Once approved, the files will be stored as individual files in [`.pair/adoption/tech/boundedcontext/`](.pair/adoption/tech/boundedcontext), one file per bounded context, plus the README.md index._

### Step 9: Evolution and Maintenance Process

**AI Assistant Instructions:** Establish process for maintaining bounded context relevance:

### During Subdomain or Architecture Evolution

**Process**:

1. **Monitor and propose context updates:**

_"I've detected changes in subdomains or technical architecture that may impact our bounded context model:_

## **ARCHITECTURE EVOLUTION IMPACT ANALYSIS**

**Change Trigger**: [Subdomain model update / Architecture decision / New requirements]
**Potential Context Impact**:
_- **New Context Needed**: [If new business capability requires isolation]_
_- **Context Boundary Adjustment**: [If subdomain mappings change]_
_- **Integration Pattern Update**: [If technical constraints change]_
_- **Anti-Corruption Layer Update**: [If external dependencies evolve]_

**PROPOSED CONTEXT UPDATES**:
[Present specific changes to bounded context model and integration patterns]

_Should I update the bounded context model to reflect these architecture changes, or do you want to review the impact assessment first?"_

**Important Note**: _Service implementation and API design details are handled in subsequent development phases. The bounded context analysis focuses on strategic boundaries and integration patterns that guide detailed service design decisions._

## Best Practices

### Do's for AI Assistants

- **Always start with subdomain foundation** - base bounded context identification on validated subdomain analysis
- **Present complete context catalog first** - propose all contexts with subdomain mappings and integration patterns before detailed definitions
- **Seek explicit approval on catalog** - ensure developer validates complete context landscape before proceeding
- **Apply strategic DDD principles rigorously** - use business cohesion, data consistency, and team autonomy as primary boundary criteria
- **Map all integration patterns systematically** - identify complete integration architecture between all contexts
- **Validate catalog iteratively** - refine the complete context model until developer confirms accuracy
- **Only proceed to detailed definitions after catalog approval** - avoid detailed work until overall context structure is validated
- **Connect contexts to business outcomes** - explicitly link each context to subdomain capabilities and business value
- **Consider team structure explicitly** - align bounded contexts with actual or desired team boundaries
- **Design for autonomy** - minimize dependencies between contexts to enable independent development
- **Follow the 🤖🤝👨‍💻 model** - propose structured analysis and seek developer validation at each major decision point
- **Address integration complexity proactively** - identify anti-corruption layers and consistency requirements early

### Don'ts for AI Assistants

- **Don't create detailed definitions before catalog approval** - validate the complete context landscape and integration patterns first
- **Don't ignore subdomain foundation** - ensure bounded contexts properly map to validated subdomain analysis
- **Don't create technology-driven contexts** - focus on business cohesion and team autonomy, not technical convenience
- **Don't overlook integration complexity** - map all context dependencies and data consistency requirements comprehensively
- **Don't skip catalog validation** - ensure developer approves complete context model before detailed work
- **Don't ignore team constraints** - consider actual team structure and capabilities when defining context boundaries
- **Don't create overly fine-grained contexts** - balance granularity with team management overhead and coordination costs
- **Don't forget external system boundaries** - identify all anti-corruption layer requirements for external integrations
- **Don't assume data consistency patterns** - explicitly validate strong vs. eventual consistency requirements with developer
- **Don't ignore performance implications** - consider latency and throughput requirements when designing integration patterns
- **Don't create isolated contexts without integration strategy** - ensure every context has clear integration patterns with others
- **Don't rush through integration validation** - thoroughly verify all context relationships and communication patterns

## Quality Assurance Checklist

- [ ] Complete subdomain analysis foundation reviewed and understood
- [ ] Comprehensive bounded context catalog proposed with subdomain mappings
- [ ] All context integration patterns and dependencies mapped
- [ ] Developer approval obtained for complete bounded context catalog
- [ ] Individual context detailed definitions created only after catalog approval
- [ ] All integration patterns validated against detailed context definitions
- [ ] Anti-corruption layer requirements identified for external system protection
- [ ] Implementation strategy aligned with team structure and technical constraints
- [ ] Data consistency boundaries explicitly defined and validated
- [ ] Team ownership and autonomy levels clearly specified per context
- [ ] Document follows adopted standards format (concise, prescriptive, English)
- [ ] Evolution process established for subdomain and architecture changes
- [ ] Complete bounded context model provides foundation for service design and API definition
- [ ] Each bounded context stored in a separate file under [`.pair/adoption/tech/boundedcontext/`](.pair/adoption/tech/boundedcontext) (folder created if not present)

## Common Pitfalls and Solutions

| Pitfall                                               | Impact                                               | Solution                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Creating detailed definitions before catalog approval | Wasted effort on wrong context boundaries            | Always validate complete context catalog and integration patterns first     |
| Ignoring subdomain foundation                         | Misaligned contexts with business capabilities       | Base all context identification on validated subdomain analysis             |
| Technology-driven context boundaries                  | Poor business cohesion and team alignment            | Focus on business capabilities and team autonomy over technical preferences |
| Missing integration complexity                        | System coupling and performance issues               | Map complete integration architecture with consistency requirements         |
| Overly fine-grained contexts                          | Team coordination overhead and management complexity | Balance context autonomy with practical team management constraints         |
| Incomplete anti-corruption layer design               | External dependency failures cascade through system  | Identify all external integration points and design appropriate protection  |
| Wrong data consistency assumptions                    | Performance problems or data integrity issues        | Explicitly validate strong vs. eventual consistency needs with developer    |
| Ignoring team structure constraints                   | Contexts that don't map to actual team capabilities  | Align context boundaries with realistic team ownership and skills           |
| Missing context relationships                         | Integration problems during implementation           | Validate complete context interaction patterns and dependencies             |
| Static context model                                  | Outdated boundaries as system evolves                | Monitor subdomain and architecture changes for context model updates        |

## References

### Core Documentation

- [Subdomain Analysis](.pair/adoption/product/subdomain) - Business capability foundation for context boundary identification (one file per subdomain)
- [Product Requirements Document](.pair/adoption/product/PRD.md) - Business context and user requirements
- [Strategic Initiatives](.pair/adoption/product/backlog/01-initiatives/) - Business priorities and capability evolution
- [Technical Architecture](.pair/adoption/tech/architecture.md) - System structure and architectural constraints
- [Technology Stack](.pair/adoption/tech/tech-stack.md) - Technology decisions and integration capabilities
- [Infrastructure](.pair/adoption/tech/infrastructure.md) - Deployment and operational patterns
- [UX/UI Guidelines](.pair/adoption/tech/ux-ui.md) - User interface boundaries and experience requirements
- [Way of Working](.pair/adoption/tech/way-of-working.md) - Team structure and collaboration patterns

### Related Process Guides

- [How to Define Subdomains](04-how-to-define-subdomains.md) - Foundation business capability analysis
- [How to Breakdown Epics](06-how-to-breakdown-epics.md) - Feature-level analysis for context validation
- [How to Complete the Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md) - Technical context establishment

### Strategic DDD Resources

- [Strategic DDD by Example: Subdomains Identification](https://levelup.gitconnected.com/strategic-ddd-by-example-subdomains-identification-4bd979f78370) - Practical context identification techniques
- [Revisiting the Basics of DDD](https://vladikk.com/2018/01/26/revisiting-the-basics-of-ddd/) - Strategic design fundamentals and bounded context principles
- [Strategic Design - Domain-Driven Design](https://medium.com/@masoud.chelongar/strategic-design-domain-driven-design-b6d25640df83) - Strategic DDD practices including bounded context patterns

### Knowledge Base Guidelines

- [Architecture Guidelines](.pair/knowledge/guidelines/architecture/architectural-guidelines.md) - Architectural patterns and principles for bounded context implementation
