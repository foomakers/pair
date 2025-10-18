# How to Complete Bootstrap Checklist - AI-Assisted Guide

## Overview

Transform PRD requirements into comprehensive technical standards through systematic checklist completion and collaborative document generation.

**Role**: Senior Technical Architect (Bootstrap & Standards Creation)
**Process**: 🤖🤝👨‍💻 (AI proposes & drafts, Developer validates & approves)

**CRITICAL FIRST STEP**: Before any bootstrap work begins, analyze PRD and existing project context to understand business requirements and constraints.

## Session State Management

**CRITICAL**: Maintain this context throughout bootstrap completion:

```
BOOTSTRAP COMPLETION STATE:
├── Project: [Project Name from PRD]
├── Bootstrap Status: [analysis | categorization | checklist | standards | approved]
├── Project Type: [Type A/B/C or pending]
├── Checklist Progress: [X/Y sections complete]
├── Standards Generated: [X/5 documents complete]
├── Current Document: [architecture|tech-stack|infrastructure|ux-ui|way-of-working]
├── Target Location: [.pair/adoption/tech/]
└── Next Action: [specific next step]
```

## Core Principles

### Systematic Bootstrap Approach

- **Analyze PRD context FIRST** - understand business requirements and constraints
- **Categorize project type** - Type A (Pet/PoC), Type B (Startup/Scale-up), Type C (Enterprise)
- **Complete checklist systematically** - architecture → tech-stack → infrastructure → ux-ui → way-of-working
- **Generate standards documents** - one at a time with validation cycles
- **Maintain consistency** - ensure all documents align and reference correct guidelines

**CRITICAL**: Before starting checklist completion:

- **HALT if PRD not analyzed** - must understand business context first
- **HALT if project type unclear** - categorization drives all technical decisions
- **HALT if team constraints unknown** - skills and budget determine technology choices
- **Do NOT proceed** without clear understanding of scale and compliance requirements

## Implementation Workflow

### Phase 0: Foundation Analysis

**Before starting**: Analyze existing project documentation to understand context.

1. **Read PRD** from [`.pair/adoption/product/PRD.md`](../adoption/product/PRD.md)
2. **Extract key constraints**:
   - Target users and scale expectations
   - Budget and timeline constraints
   - Team size and technical skills
   - Compliance and integration requirements
3. **Update session state** with analysis complete

### Phase 1: Project Categorization

**Objective**: Determine project type to guide all technical decisions.

**Process**: Analyze project characteristics and propose categorization:

1. **Evaluate project indicators** from PRD analysis:

   - Team size and budget constraints
   - Scale expectations and performance needs
   - Compliance and integration complexity
   - Timeline pressures and market requirements

2. **Present categorization with evidence**:
   _"Based on PRD analysis, this project fits **[Type X]** categorization:_

   - _Budget/Resources: [specific evidence]_
   - _Team Structure: [size and skills]_
   - _Scale Requirements: [users and performance]_
   - _Complexity: [integrations and compliance]_

   _This suggests **[Type X: Category Name]** approach. Does this align with your vision?"_

3. **Handle categorization feedback** and proceed when confirmed

**Project Categories Reference**: [Bootstrap Checklist](../assets/bootstrap-checklist.md)

### Phase 2: Checklist Completion

**Objective**: Systematically gather information for all technical decisions.

**Process**: Work through checklist sections with targeted questions:

1. **Architecture Assessment** - scale, integrations, compliance
   _"From your PRD, I see [evidence], but need clarification on:_

   - _Expected concurrent users and data volume_
   - _Required integrations with existing systems_
   - _Compliance requirements (GDPR, SOC2, etc.)_
   - _Performance targets and SLAs"_

2. **Technology Stack Analysis** - team skills, preferences, constraints
   _"Based on your team info, I understand [composition], but need to verify:_

   - _Current team strengths and learning capacity_
   - _Operational preferences (managed vs self-hosted)_
   - _Performance and maintenance requirements"_

3. **Infrastructure Requirements** - deployment, operations, monitoring
4. **UX/UI Standards** - design systems, accessibility, device support
5. **Way of Working** - processes, quality gates, release cycles

**Ask 3-4 focused questions at a time** and wait for responses before proceeding.

**Architecture Guidelines Reference**: [Architecture Guidelines](../guidelines/architecture/README.md)
**Technical Standards Reference**: [Technical Standards](../guidelines/technical-standards/README.md)

### Phase 3: Standards Document Generation

**Objective**: Create five adopted standards documents based on completed checklist.

**Process**: Generate documents following adopted standards format:

1. **Document Generation Order**:

   - `architecture.md` → foundational decisions
   - `tech-stack.md` → technology choices with versions
   - `infrastructure.md` → deployment and operations
   - `ux-ui.md` → design standards and patterns
   - `way-of-working.md` → development processes

2. **Document Review Cycle** (for each document):

   - Present key decisions with rationale
   - Show complete document for detailed review
   - Iterate based on feedback
   - Get final approval before saving

3. **Standards Format Requirements**: [Adopted Standards README](../adoption/tech/README.md)

**Infrastructure Guidelines Reference**: [Infrastructure Guidelines](../guidelines/infrastructure/README.md)
**UX Guidelines Reference**: [UX Guidelines](../guidelines/user-experience/README.md)

### Phase 4: Finalization & Storage

**Objective**: Save approved documents and establish update process.

1. **Save all documents** to [`.pair/adoption/tech/`](../adoption/tech/) folder
2. **Verify consistency** across all standards documents
3. **Establish update process** for future iterations and ADR changes
4. **Update session state** to approved status

## Quality Standards

### Bootstrap Completion Guidelines

**Follow systematic approach**:

- Complete foundation analysis before categorization
- Validate project type before technical decisions
- Work through checklist sections in logical order
- Generate documents individually with review cycles
- Maintain consistency across all standards

**Document Quality Requirements**:

- Follow [adopted standards format](../adoption/tech/README.md) exactly
- Write concisely and prescriptively in English
- Include specific versions and configuration details
- Reference knowledge-base documents for detailed rationale
- Ensure self-consistency across all five documents

### Best Practices for AI Assistants

**Do's:**

- Start with comprehensive PRD and ADR analysis
- Present categorization with specific evidence from analysis
- Ask focused questions in logical groups (3-4 at a time)
- Generate documents individually with validation cycles
- Maintain strict consistency across all standards documents
- Reference appropriate guidelines for implementation details

**Don'ts:**

- Never skip foundation analysis - context drives all decisions
- Don't assume project constraints without validation
- Don't present all documents simultaneously
- Don't make technology choices without clear rationale
- Don't create inconsistent standards across documents
- Don't proceed without developer approval at each phase

### Final Quality Checklist

**Completeness:**

- [ ] Bootstrap checklist fully completed with all sections addressed
- [ ] Project categorization confirmed and documented
- [ ] All five adopted standards documents generated and approved
- [ ] Documents stored in correct [`.pair/adoption/tech/`](../adoption/tech/) locations

**Quality:**

- [ ] Internal consistency verified across all documents
- [ ] Technology choices align with project categorization and constraints
- [ ] All documents follow adopted standards format requirements
- [ ] Knowledge-base references included for detailed explanations
- [ ] Update process established for future iterations

---

## References

**Primary Implementation Assets:**

- [Bootstrap Checklist](../assets/bootstrap-checklist.md) - Complete project setup framework
- [Adopted Standards README](../adoption/tech/README.md) - Format requirements for all documents

**Guidelines for Implementation:**

- [Architecture Guidelines](../guidelines/architecture/README.md) - Architectural patterns and decisions
- [Technical Standards](../guidelines/technical-standards/README.md) - Technology selection criteria
- [Infrastructure Guidelines](../guidelines/infrastructure/README.md) - Deployment and operational guidance
- [UX Guidelines](../guidelines/user-experience/README.md) - Design system and user experience standards
- [Collaboration Guidelines](../guidelines/collaboration/README.md) - Development processes and team workflows

**Target Output Locations:**

- [Architecture Standards](../adoption/tech/architecture.md) - System design decisions
- [Tech Stack Standards](../adoption/tech/tech-stack.md) - Technology choices and versions
- [Infrastructure Standards](../adoption/tech/infrastructure.md) - Deployment and operations
- [UX/UI Standards](../adoption/tech/ux-ui.md) - Design system and patterns
- [Way of Working](../adoption/tech/way-of-working.md) - Development processes

## Next Steps

After bootstrap completion, proceed with strategic planning and development:

**Strategic Planning:**

- **Create & Prioritize Initiatives** → [03-how-to-create-and-prioritize-initiatives.md](03-how-to-create-and-prioritize-initiatives.md)
- **Define Project Subdomains** → [04-how-to-define-subdomains.md](04-how-to-define-subdomains.md)
- **Define Bounded Contexts** → [05-how-to-define-bounded-contexts.md](05-how-to-define-bounded-contexts.md)

**Development Preparation:**

- **Breakdown Epics** → [06-how-to-breakdown-epics.md](06-how-to-breakdown-epics.md)
- **Create User Stories** → [07-how-to-breakdown-user-stories.md](07-how-to-breakdown-user-stories.md)
- **Create Tasks** → [09-how-to-create-tasks.md](09-how-to-create-tasks.md)
