# How to Define Subdomains - AI-Assisted Guide

## Overview

Transform Product Requirements Documents and strategic initiatives into Domain-Driven Design subdomains through collaborative business analysis and systematic domain modeling.

**Role**: Strategic Domain Architect (Subdomain Definition)
**Process**: 🤖🤝👨‍💻 (AI analyzes & proposes, Developer validates & approves)

**CRITICAL FIRST STEP**: Before subdomain work begins, verify PRD completion and project management tool configuration.

## Session State Management

**CRITICAL**: Maintain this context throughout subdomain definition:

```
SUBDOMAIN DEFINITION STATE:
├── Project: [Project Name from PRD]
├── Definition Status: [foundation | analysis | validation | documentation]
├── PM Tool: [filesystem | github-projects | jira | linear | other]
├── PM Access: [tool-specific access method]
├── Subdomain Count: [X core, Y supporting, Z generic]
├── Catalog Status: [proposed | validated | documented]
├── Target Location: [.pair/adoption/product/subdomain/]
└── Next Action: [specific next step]
```

## Core Principles

### Strategic Domain Modeling

- **Analyze PRD and initiatives systematically** - extract business capabilities and strategic priorities
- **Apply DDD classification framework** - core/supporting/generic based on business value and complexity
- **Create catalog before details** - validate complete subdomain landscape first, then define individually
- **Follow DDD implementation patterns**: [Domain-Driven Design Guidelines](.pair/knowledge/guidelines/architecture/design-patterns/domain-driven-design.md)
- **Apply strategic subdomain framework**: [Strategic Subdomain Definition](.pair/knowledge/guidelines/architecture/design-patterns/strategic-subdomain-definition.md)
- **Document with standards**: [Documentation Guidelines](../guidelines/documentation/README.md)

**CRITICAL**: Before starting subdomain definition:

- **HALT if PRD incomplete** - business context drives all domain decisions
- **HALT if initiatives missing** - strategic priorities determine subdomain classification
- **HALT if tool not configured** - project management approach must be established
- **Do NOT proceed** without clear business capabilities understanding

## Implementation Workflow

### Phase 1: Foundation Setup

**Objective**: Verify prerequisites and establish domain analysis approach.

1. **Check Prerequisites**:

   - PRD exists and complete: [`.pair/product/adopted/PRD.md`](../adoption/product/PRD.md)
   - Initiatives identified: Following [PM Tool Guidelines](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)
   - Bootstrap complete: [`.pair/adoption/tech/`](../adoption/tech/)

2. **Configure Domain Analysis Context**:

   _"I need to analyze your business domain for subdomain identification. I see:_

   - _**PRD**: [status from file analysis]_
   - _**Initiatives**: [count and PM tool status]_
   - _**Technical Context**: [bootstrap completion status]_

   _For subdomain analysis, I'll need access to your strategic initiatives. Based on your configuration, I'll use [configured PM tool]. Ready to proceed with domain analysis?"_

**Prerequisites Reference**: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)

### Phase 2: Business Analysis & Catalog Creation

**Objective**: Extract business capabilities and create comprehensive subdomain catalog.

1. **Business Capability Analysis**:

   - Extract core business functions from PRD objectives and value propositions
   - Map strategic initiatives to business capability areas
   - Identify cross-cutting concerns and shared functionality patterns
   - Assess business complexity and strategic importance

2. **Initial Subdomain Catalog**:

   _"Based on PRD and initiatives analysis, I propose this subdomain catalog:_

   **Core Subdomains** (Competitive advantage):

   - _[Core A]: [Business purpose] - [Strategic importance evidence]_
   - _[Core B]: [Business purpose] - [Strategic importance evidence]_

   **Supporting Subdomains** (Operational excellence):

   - _[Supporting A]: [Business purpose] - [Operational necessity]_
   - _[Supporting B]: [Business purpose] - [Operational necessity]_

   **Generic Subdomains** (Cost optimization):

   - _[Generic A]: [Business purpose] - [Commodity function]_
   - _[Generic B]: [Business purpose] - [Commodity function]_

   **Key Relationships**:

   - _[Dependencies and data flow patterns]_

   _Does this catalog accurately represent your business domain? What adjustments are needed?"_

3. **Domain Relationship Mapping**:
   - Apply [DDD Context Mapping](.pair/knowledge/guidelines/architecture/design-patterns/domain-driven-design.md) patterns
   - Identify integration complexity and coordination requirements
   - Map data flow and dependency patterns between subdomains

### Phase 3: Validation & Detailed Definition

**Objective**: Refine catalog through feedback and create detailed subdomain specifications.

1. **Catalog Refinement**:

   _"Based on your feedback, I'll update the catalog:_

   **Changes Applied**:

   - _Add: [New subdomain] - [Rationale]_
   - _Reclassify: [Subdomain] from [Old] to [New] - [Business justification]_
   - _Merge/Split: [Boundary adjustments] - [Reason]_

   **Updated Relationships**: [Revised dependency patterns]

   _Is this the final subdomain catalog for detailed definition?"_

2. **Individual Subdomain Definition**:

   For each validated subdomain, create comprehensive specification:

   ```markdown
   ## [SUBDOMAIN NAME] ([Classification])

   **Business Purpose**: [Clear value statement]
   **Key Capabilities**: [Primary business functions]
   **Strategic Rationale**: [Why this classification]
   **Dependencies**: [Integration requirements]
   **Team Recommendations**: [Structure and skills]
   **Implementation Priority**: [Development sequence rationale]
   ```

### Phase 4: Documentation & Storage

**Objective**: Generate structured documentation following established standards.

1. **File Generation**:

   _"Creating subdomain documentation in [`.pair/adoption/product/subdomain/`](../adoption/product/subdomain/):_

   - _Individual files: [subdomain-name].md for each subdomain_
   - _README.md: Catalog index with links and descriptions_
   - _Format: Following [Documentation Standards](../guidelines/documentation/README.md)_

   _All files will be validated before storage. Ready to generate?"_

2. **Documentation Review**:

   - Present complete subdomain documentation for approval
   - Iterate on feedback until developer validates content
   - Store final files in adoption directory structure
   - Update session state with completion status

## Quality Assurance

**Essential Checklist**:

- [ ] Complete PRD and initiatives analysis performed
- [ ] All subdomains classified using DDD framework (core/supporting/generic)
- [ ] Comprehensive relationship mapping completed
- [ ] Developer validation obtained for complete catalog
- [ ] Individual subdomain definitions follow established format
- [ ] Documentation stored in correct adoption structure
- [ ] Session state maintained throughout process
- [ ] Ready for bounded context definition phase

## References

### Core Documentation

- [Product Requirements Document](../adoption/product/PRD.md) - Business context and objectives
- [Strategic Initiatives](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) - Business priorities and roadmap
- [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md) - Prerequisites and setup

### Guidelines Integration

- [Domain-Driven Design](.pair/knowledge/guidelines/architecture/design-patterns/domain-driven-design.md) - DDD implementation patterns
- [Strategic Subdomain Definition](.pair/knowledge/guidelines/architecture/design-patterns/strategic-subdomain-definition.md) - Comprehensive subdomain classification framework
- [Documentation Standards](../guidelines/documentation/README.md) - Format and structure requirements
- [Team Responsibilities](.pair/knowledge/guidelines/collaboration/team/role-responsibilities.md) - Subdomain definition roles

### Next Phase

- [How to Define Bounded Contexts](05-how-to-define-bounded-contexts.md) - Technical implementation boundaries
