# How to Define Bounded Contexts - AI-Assisted Guide

## Overview

Transform subdomain analysis and technical architecture into precise bounded context boundaries through collaborative Domain-Driven Design implementation. Bounded contexts establish service boundaries, data ownership patterns, and team responsibilities that guide microservices design and organizational structure.

**Role**: Product Engineer (Bounded Context Definition)
**Process**: 🤖🤝👨‍💻 (AI analyzes & proposes, Developer validates & approves)

**CRITICAL FIRST STEP**: Before bounded context work begins, verify subdomain definition completion and technical architecture adoption.

## Session State Management

**CRITICAL**: Maintain this context throughout bounded context definition:

```text
BOUNDED CONTEXT DEFINITION STATE:
├── Project: [Project Name from PRD]
├── Definition Status: [foundation | catalog | validation | documentation]
├── Subdomain Source: [.pair/adoption/product/subdomain/ analyzed]
├── Architecture Source: [.pair/adoption/tech/ analyzed]
├── Context Count: [X core, Y supporting, Z infrastructure]
├── Integration Patterns: [sync: X, async: Y, ACL: Z]
├── Target Location: [.pair/adoption/tech/boundedcontext/]
└── Next Action: [specific next step]
```

## Core Principles

### Strategic Context Architecture

- **Analyze subdomain foundation FIRST** - base contexts on validated [subdomain definitions](../../adoption/product/subdomain)
- **Apply DDD context mapping** - use [Bounded Context Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md)
- **Create catalog before details** - validate complete context landscape first, then define individually
- **Design for team autonomy** - align contexts with team boundaries and deployment independence
- **Map integration patterns** - identify all context relationships and anti-corruption layer needs
- **Follow adoption standards** - document per [Documentation Guidelines](../guidelines/README.md)

**CRITICAL**: Before starting bounded context definition:

- **HALT if subdomains incomplete** - business context boundaries drive technical boundaries
- **HALT if architecture undefined** - technical patterns determine integration approaches
- **HALT if team structure unclear** - context ownership must align with team capabilities
- **Do NOT proceed** without clear understanding of service design requirements

## Implementation Workflow

### Phase 1: Foundation Analysis

**Objective**: Analyze subdomain model and technical architecture to extract context boundaries.

1. **Analyze Prerequisites**:

   - Subdomain definitions: [`.pair/adoption/product/subdomain/`](../../adoption/product/subdomain)
   - Technical architecture: [`.pair/adoption/tech/architecture.md`](../../adoption/tech/architecture.md)
   - Technology stack: [`.pair/adoption/tech/tech-stack.md`](../../adoption/tech/tech-stack.md)
   - Team structure: [`.pair/adoption/tech/way-of-working.md`](../../adoption/tech/way-of-working.md)

2. **Extract Context Indicators from Adoption Files**:

   **From PRD** ([`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)):

   - User personas and workflows that suggest UI context boundaries
   - Business capabilities that require different data consistency models
   - Success metrics that indicate separate measurement contexts
   - Integration requirements with external systems

   **From Architecture** ([`.pair/adoption/tech/architecture.md`](../../adoption/tech/architecture.md)):

   - Service decomposition patterns (microservices vs modular monolith)
   - Data consistency requirements (strong vs eventual consistency)
   - Performance requirements that drive service boundaries
   - Security boundaries and compliance requirements

   **From Tech Stack** ([`.pair/adoption/tech/tech-stack.md`](../../adoption/tech/tech-stack.md)):

   - Technology constraints that influence service separation
   - Database choices that impact data ownership boundaries
   - Communication protocols available for integration patterns
   - Deployment unit preferences (containers, serverless, etc.)

   **From Infrastructure** ([`.pair/adoption/tech/infrastructure.md`](../../adoption/tech/infrastructure.md)):

   - Deployment boundaries and scaling requirements
   - Network topology that influences service communication
   - Security zones that require context isolation
   - Operational monitoring and observability needs

   **From UX/UI** ([`.pair/adoption/tech/ux-ui.md`](../../adoption/tech/ux-ui.md)):

   - User journey boundaries that suggest frontend context separation
   - Design system components that indicate shared UI contexts
   - Device-specific requirements that drive context boundaries
   - Accessibility requirements that influence service design

   **From Way of Working** ([`.pair/adoption/tech/way-of-working.md`](../../adoption/tech/way-of-working.md)):

   - Team structure and ownership that drives context boundaries
   - Development velocity requirements for independent deployment
   - Communication patterns between teams
   - Release cycle preferences that influence service granularity

3. **Handle Missing Foundation**:

   _"I need to verify context definition prerequisites using adoption files:_

   - _**PRD Analysis** ([PRD.md](../../adoption/product/PRD.md)): [business capabilities and user workflows identified]_
   - _**Architecture Decisions** ([architecture.md](../../adoption/tech/architecture.md)): [service patterns and consistency models defined]_
   - _**Technology Stack** ([tech-stack.md](../../adoption/tech/tech-stack.md)): [integration capabilities and deployment constraints]_
   - _**Infrastructure Setup** ([infrastructure.md](../../adoption/tech/infrastructure.md)): [deployment boundaries and scaling patterns]_
   - _**Team Structure** ([way-of-working.md](../../adoption/tech/way-of-working.md)): [ownership model and communication patterns]_

   _Missing or incomplete: [specific adoption files]. Should we complete [missing decisions] first or proceed with available constraints?"_

**Context Boundary Synthesis**: Combine insights from all adoption files using [Context Identification Criteria](../guidelines/architecture/design-patterns/bounded-contexts.md#context-identification)

**Foundation Reference**: [Subdomain Definition](04-how-to-define-subdomains.md)

### Phase 2: Context Catalog Creation

**Objective**: Propose comprehensive bounded context catalog with subdomain mappings and integration patterns.

1. **Business Capability Grouping**:

   **Apply Adoption Constraints from Technical Decisions**:

   - **Architecture patterns** from [architecture.md](../../adoption/tech/architecture.md): microservices vs modular monolith influences context granularity
   - **Technology stack** from [tech-stack.md](../../adoption/tech/tech-stack.md): database choices determine data ownership boundaries
   - **Infrastructure constraints** from [infrastructure.md](../../adoption/tech/infrastructure.md): deployment units and scaling requirements
   - **Team boundaries** from [way-of-working.md](../../adoption/tech/way-of-working.md): ownership model drives context responsibility

   **Business Context Analysis**:

   - **PRD capabilities** from [PRD.md](../../adoption/product/PRD.md): user journeys and business processes that require isolation
   - **UX boundaries** from [ux-ui.md](../../adoption/tech/ux-ui.md): frontend context separation based on user interface patterns
   - **Subdomain groupings** that align with technical and organizational constraints
   - Use [Context Boundaries criteria](../guidelines/architecture/design-patterns/bounded-contexts.md#context-boundaries) to validate technical and business alignment

2. **Context Catalog Proposal**:

   _"Based on adoption file analysis and subdomain mapping, I propose this bounded context catalog:_

   **Context Design Drivers** (from adoption files):

   - _Architecture: [microservices/modular monolith choice influences granularity]_
   - _Technology: [database per service/shared database affects boundaries]_
   - _Infrastructure: [container deployment/serverless affects service sizing]_
   - _Team Structure: [team size and skills determine context ownership]_
   - _UX Patterns: [user journey boundaries suggest frontend context separation]_

   **Core Business Contexts** (High autonomy):

   - _[Context A]: [Subdomains X,Y] - [Business capability] - [Team ownership] - [Tech constraints from stack]_
   - _[Context B]: [Subdomain Z] - [Business capability] - [Team ownership] - [Integration pattern from architecture]_

   **Supporting Contexts** (Medium autonomy):

   - _[Context C]: [Subdomains A,B] - [Operational capability] - [Coordination needs] - [Infrastructure requirements]_

   **Infrastructure Contexts** (Shared services):

   - _[Context D]: [Subdomains C,D] - [Technical capability] - [Platform team] - [Deployment boundary from infrastructure]_

   **Integration Patterns** (constrained by tech stack):

   - _Sync: [Context A] ↔ [Context B] via [REST/gRPC from tech-stack] for [use case]_
   - _Async: [Context A] → [Context C] via [Events/Message Queue from infrastructure] for [use case]_
   - _ACL: [Context B] ↔ [External System] with [protection strategy from architecture]_

   **Context Relationships** (per team structure):

   - _[Context A] upstream → [Context B] downstream: [data/service flow based on team dependencies]_
   - _[Context C] ↔ [Context D] bidirectional: [shared infrastructure services]_

   _Does this context landscape align with your adopted technical constraints and team structure?"_

3. **Catalog Refinement**:

   _"Based on feedback, I'll adjust the catalog:_

   - _Add/Remove: [Context changes with rationale]_
   - _Merge/Split: [Boundary adjustments with reasons]_
   - _Reassign: [Subdomain moves with justification]_

   _Updated integration patterns (using [Integration Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md#integration-patterns)):_

   - _Partnership: [cooperative contexts] with coordinated evolution_
   - _Customer-Supplier: [upstream] → [downstream] with negotiated interfaces_
   - _Anticorruption Layer: [downstream] protected from [upstream] changes_

   _Is this the final context catalog for detailed definition?"_

**Context Mapping Reference**: [Bounded Context Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md)

### Phase 3: Context Validation & Documentation

**Objective**: Create detailed context specifications and comprehensive integration architecture.

1. **Individual Context Definition**:

   For each validated context, create specification following this structure:

   ```markdown
   ## [CONTEXT NAME] ([Type])

   **Business Purpose**: [Core capability and value]
   **Subdomain Coverage**: [Included subdomains with rationales]
   **Team Ownership**: [Responsible team and autonomy level]
   **Service Boundaries**: [Internal services and public interfaces]
   **Data Ownership**: [Key aggregates and consistency requirements]
   **Integration Patterns**: [Dependencies and provided services using specific patterns from [Context Communication](../guidelines/architecture/design-patterns/bounded-contexts.md#context-communication)]
   **Ubiquitous Language**: [Context-specific terminology and dialect per [Language Guidelines](../guidelines/architecture/design-patterns/bounded-contexts.md#ubiquitous-language)]
   **Quality Attributes**: [Performance, scalability, reliability needs]
   ```

2. **Integration Architecture Validation**:

   _"Complete integration architecture for validation (following [Integration Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md#integration-patterns)):_

   **Synchronous Integrations** ([X] total):

   - _[Context A] → [Context B]: [Customer-Supplier/Open Host Service] for [use case] - [consistency needs]_

   **Asynchronous Integrations** ([Y] total):

   - _[Context A] → [Context C]: [Event-Driven/Published Language] for [use case] - [eventual consistency]_

   **Anti-Corruption Layers** ([Z] total):

   - _[Context] ↔ [External]: [ACL Protection strategy] - [risk mitigation]_

   **Context Map** (per [Context Maps Guidelines](../guidelines/architecture/design-patterns/bounded-contexts.md#context-maps)):

   - _Upstream/Downstream relationships documented_
   - _Integration patterns specified for each connection_
   - _Team responsibilities mapped to contexts_

   _This architecture balances autonomy with coordination needs. Approved for documentation?"_

### Phase 4: Documentation & Storage

**Objective**: Generate structured documentation following established standards.

1. **Document Generation**:

   _"Creating bounded context documentation in [`.pair/adoption/tech/boundedcontext/`](../../adoption/tech/boundedcontext):_

   - _Individual files: [context-name].md for each context_
   - _README.md: Context catalog with integration overview and [Context Map](../guidelines/architecture/design-patterns/bounded-contexts.md#context-maps)_
   - _Format: Following [Documentation Standards](../guidelines/README.md)_
   - _Integration patterns documented per [Implementation Strategies](../guidelines/architecture/design-patterns/bounded-contexts.md#implementation-strategies)_

   _All files validated and ready for storage. Proceed with generation?"_

2. **Implementation Guidance**:

   _"Context architecture complete. Ready for service design phase:_

   - _[X] contexts defined with clear boundaries_
   - _[Y] integration patterns established_
   - _[Z] anti-corruption layers specified_
   - _Team ownership aligned with service boundaries_

   _Next: Service implementation following context specifications."_

## Quality Assurance

**Essential Checklist**:

- [ ] Subdomain analysis foundation complete and analyzed
- [ ] Technical architecture and team structure verified
- [ ] Complete context catalog proposed with subdomain mappings
- [ ] All integration patterns identified and validated
- [ ] Developer approval obtained for complete context landscape
- [ ] Individual context definitions created with comprehensive specifications
- [ ] Integration architecture validated against performance and autonomy requirements
- [ ] Anti-corruption layer strategies defined for external system protection
- [ ] Documentation stored in adoption structure with README.md index
- [ ] Session state maintained throughout process with clear next actions

## References

### Core Dependencies

- [Subdomain Definition](04-how-to-define-subdomains.md) - Business context foundation
- [Technical Architecture](../../adoption/tech/architecture.md) - Integration constraints and patterns
- [Team Structure](../../adoption/tech/way-of-working.md) - Organizational boundaries and capabilities

### Implementation Guidelines

- [Bounded Context Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md) - Context identification and implementation strategies
- [Domain-Driven Design](../guidelines/architecture/design-patterns/domain-driven-design.md) - DDD implementation patterns
- [Strategic Subdomain Definition](../guidelines/architecture/design-patterns/strategic-subdomain-definition.md) - Context boundary strategies
- [Documentation Standards](../guidelines/README.md) - Format and structure requirements

### Next Phase

- [Epic Breakdown](06-how-to-breakdown-epics.md) - Transform contexts into development initiatives
