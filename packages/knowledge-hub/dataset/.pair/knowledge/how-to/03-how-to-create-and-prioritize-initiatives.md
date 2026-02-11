# How to Create and Prioritize Initiatives - AI-Assisted Guide

## Overview

Transform Product Requirements Documents (PRDs) into strategic initiatives through collaborative analysis and prioritization. Strategic initiatives bridge product vision with executable development work, establishing clear business value, measurable objectives, and optimal resource allocation.

**Role**: Product Owner/Manager (Collaborative Planning)
**Process**: 🤖🤝👨‍💻 (AI proposes & analyzes, Developer validates & decides)

**CRITICAL FIRST STEP**: Before initiative creation begins, verify bootstrap completion and project management tool configuration.

## Session State Management

**CRITICAL**: Maintain this context throughout initiative creation:

```
INITIATIVE CREATION STATE:
├── Project: [Project Name from PRD]
├── Creation Status: [foundation | analysis | prioritization | creation | planning]
├── PM Tool: [filesystem | github-projects | jira | linear | other]
├── PM Access: [tool-specific access method]
├── Initiative Count: [X initiatives identified, Y created]
├── Current Priority: [P0 | P1 | P2 processing]
├── Template Used: [initiative-template.md]
└── Next Action: [specific next step]
```

## Core Principles

### Strategic Initiative Framework

- **Analyze PRD systematically** - extract business objectives, user value, and constraints
- **Prioritize by business impact** - use P0/P1/P2 framework aligned with PRD goals
- **Create collaboratively** - validate each initiative through structured feedback loops
- **Document comprehensively** - follow [Initiative Template](../guidelines/collaboration/templates/initiative-template.md)
- **Plan dependencies** - establish timeline and resource requirements

**CRITICAL**: Before starting initiative creation:

- **HALT if bootstrap incomplete** - must have PRD and technical standards established
- **HALT if tool not configured** - project management approach must be defined
- **HALT if PRD not analyzed** - business context drives all initiative decisions
- **Do NOT proceed** without clear understanding of project constraints and goals

## Implementation Workflow

### Phase 1: Foundation Setup

**Objective**: Verify prerequisites and establish project management approach.

1. **Check Bootstrap Status**:

   - PRD exists and is complete: [`.pair/product/adopted/PRD.md`](../../adoption/product/PRD.md)
   - Technical standards established: [`.pair/adoption/tech/`](../../adoption/tech)
   - Project management tool configured: [`.pair/adoption/tech/way-of-working.md`](../../adoption/tech/way-of-working.md)

2. **Configure Project Management Access**:

   - **Read tool configuration** from way-of-working.md
   - **Follow tool-specific guidelines**: [Project Management Framework](../guidelines/collaboration/project-management-tool/README.md)
   - **Prepare initiative template**: [Initiative Template](../guidelines/collaboration/templates/initiative-template.md)

3. **Handle Missing Configuration**:

   _"I need to verify your project management setup. I see [bootstrap status]. For initiative management, would you prefer:_

   - _**File-based system** (markdown files in repository)_
   - _**GitHub Projects** (integrated with repository)_
   - _**External tool** (Jira, Linear, etc.)_

   _This determines how we'll structure and track initiatives. What's your preference?"_

**Prerequisites Reference**: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)

### Phase 2: Analysis & Prioritization

**Objective**: Extract business objectives from PRD and establish initiative priority framework.

1. **PRD Analysis**:

   - Extract primary business objectives and user value propositions
   - Identify technical constraints and success metrics from PRD
   - Map user pain points to potential solution areas
   - Assess market timing and competitive requirements

2. **Initiative Identification**:

   - Propose potential initiatives that deliver PRD objectives
   - Group related functionality into coherent business value streams
   - Estimate complexity and resource requirements
   - Identify dependencies between potential initiatives

3. **Prioritization Framework**:

   _"Based on PRD analysis, I've identified [X] potential initiatives. Here's my prioritization using business impact vs. implementation complexity:_

   - _**P0 (Must-Have)**: [initiatives] - Core value proposition enablers_
   - _**P1 (Should-Have)**: [initiatives] - Competitive advantages and growth drivers_
   - _**P2 (Could-Have)**: [initiatives] - Experience enhancements and optimizations_

   _Does this prioritization align with your business strategy? What would you adjust?"_

**Analysis Guidelines**: [Business Value Assessment](../guidelines/quality-assurance/performance/continuous-improvement.md#business-value-assessment)

### Phase 3: Initiative Creation

**Objective**: Collaboratively develop each initiative using structured template and validation cycles.

**Process**: Work through initiatives by priority (P0 → P1 → P2):

1. **Initiative Draft Creation**:

   - Present complete initiative using [Initiative Template](../guidelines/collaboration/templates/initiative-template.md)
   - Focus on business rationale, scope definition, and success metrics
   - Include risk assessment and mitigation strategies
   - Propose timeline and resource estimates

2. **Collaborative Refinement**:

   _"Here's my draft for Initiative: [Name]. I've structured it around [key business value]. The scope includes [major components] with success measured by [specific metrics]. Key risks I've identified: [risks with mitigations]. Does this capture your vision? What needs adjustment?"_

3. **Validation Cycle**:

   - Validate business rationale and scope boundaries
   - Refine success metrics and acceptance criteria
   - Adjust timeline and resource estimates
   - Confirm risk assessment and mitigation plans

4. **Tool-Specific Documentation**:
   - **Follow tool guidelines**: [Project Management Framework](../guidelines/collaboration/project-management-tool/README.md)
   - Create initiative in configured project management tool
   - Ensure proper labeling, priority assignment, and organization
   - Maintain cross-references and documentation links

### Phase 4: Documentation & Planning

**Objective**: Finalize initiative documentation and establish roadmap with dependencies.

1. **Initiative Documentation**:

   - Verify all initiatives follow template requirements completely
   - Ensure consistent terminology and formatting across initiatives
   - Validate scope boundaries and success criteria clarity
   - Confirm tool-specific metadata and organization

2. **Dependency Mapping**:

   - Analyze technical and business dependencies between initiatives
   - Identify resource constraints and team capacity considerations
   - Map critical path and potential bottlenecks
   - Plan risk mitigation buffers in timeline

3. **Roadmap Creation**:

   _"I've documented all [X] initiatives in [Tool Name]. Here's the roadmap I propose based on dependencies and capacity:_

   - _**Phase 1 (Weeks 1-X)**: [P0 initiatives] - Core value delivery_
   - _**Phase 2 (Weeks X-Y)**: [P1 initiatives] - Competitive advantages_
   - _**Phase 3 (Weeks Y-Z)**: [P2 initiatives] - Experience enhancements_

   _This assumes [capacity assumptions] and includes [buffer considerations]. How should we adjust this plan?"_

4. **Finalization**:
   - Update session state to completed status
   - Prepare handoff documentation for epic breakdown phase
   - Establish process for initiative updates and iterations
   - Verify tool integration for next development phase

**Planning Reference**: [Roadmap Planning Guidelines](../guidelines/collaboration/templates/initiative-template.md#quarterly-roadmap)

## Quality Standards

### Initiative Quality Requirements

**Content Completeness**:

- [ ] Business objective clearly states measurable outcome aligned with PRD
- [ ] Success metrics include specific targets and measurement methods
- [ ] Scope explicitly defines inclusions and exclusions to prevent scope creep
- [ ] Risk assessment covers technical, business, and resource risks with mitigation plans
- [ ] Timeline estimates consider dependencies and team capacity constraints

**Documentation Standards**:

- [ ] Follows [Initiative Template](../guidelines/collaboration/templates/initiative-template.md) structure completely
- [ ] Uses consistent terminology with PRD and technical standards
- [ ] Maintains proper tool-specific formatting and metadata
- [ ] Includes appropriate cross-references and documentation links

**Prioritization Validation**:

- [ ] **P0**: Core value proposition enablers that are launch-critical
- [ ] **P1**: Competitive advantages that drive growth and user adoption
- [ ] **P2**: Experience enhancements that improve retention and satisfaction
- [ ] Dependencies flow correctly (higher priority initiatives don't depend on lower)
- [ ] Resource allocation is realistic given team capacity and timeline

### Best Practices for AI Assistants

**Do's:**

- Start with comprehensive PRD analysis to understand business context
- Follow [Project Management Framework](../guidelines/collaboration/project-management-tool/README.md) consistently
- Focus on one initiative at a time for quality and engagement
- Connect each initiative to specific business value and measurable outcomes
- Validate assumptions through targeted questions rather than presumptions
- Consider resource constraints and dependencies in all planning

**Don'ts:**

- Never create initiatives without thorough PRD analysis first
- Never bypass tool configuration requirements from way-of-working.md
- Don't assume business priorities without explicit developer validation
- Don't skip scope definition - unclear boundaries cause project failures
- Don't underestimate technical dependencies between initiatives
- Don't finalize timelines without considering realistic team capacity

## Common Pitfalls and Solutions

| Pitfall                     | Impact                            | Solution                                                     |
| --------------------------- | --------------------------------- | ------------------------------------------------------------ |
| **Vague objectives**        | Unclear success criteria          | Use specific, measurable language with concrete outcomes     |
| **Scope creep risk**        | Timeline and resource overruns    | Explicitly define out-of-scope items in initiative template  |
| **Unrealistic timelines**   | Team burnout and missed deadlines | Include buffer time and validate with team capacity          |
| **Missing dependencies**    | Initiative blocking and delays    | Map all technical, resource, and business dependencies       |
| **Weak business rationale** | Lack of stakeholder buy-in        | Connect each initiative to specific PRD goals and user value |

---

## References

**Primary Implementation Assets:**

- [Initiative Template](../guidelines/collaboration/templates/initiative-template.md) - Complete structure and fields for initiative documentation
- [Project Management Framework](../guidelines/collaboration/project-management-tool/README.md) - Tool-specific guidelines and access procedures

**Guidelines for Implementation:**

- [Business Value Assessment](../guidelines/quality-assurance/performance/continuous-improvement.md#business-value-assessment) - Framework for analyzing and prioritizing business impact
- [Roadmap Planning Guidelines](../guidelines/collaboration/templates/initiative-template.md#quarterly-roadmap) - Timeline and dependency management best practices

**Prerequisite Documentation:**

- [`.pair/product/adopted/PRD.md`](../../adoption/product/PRD.md) - Product Requirements Document with business objectives
- [`.pair/adoption/tech/way-of-working.md`](../../adoption/tech/way-of-working.md) - Project management tool configuration
- [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md) - Process for establishing foundational documentation

## Next Steps

After initiative creation, proceed with tactical planning:

**Epic Development:**

- **Define Bounded Contexts** → [05-how-to-define-bounded-contexts.md](05-how-to-define-bounded-contexts.md)
- **Breakdown Epics** → [06-how-to-breakdown-epics.md](06-how-to-breakdown-epics.md)

**Story Creation:**

- **Create User Stories** → [07-how-to-breakdown-user-stories.md](07-how-to-breakdown-user-stories.md)
- **Refine User Stories** → [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md)
- **Create Tasks** → [09-how-to-create-tasks.md](09-how-to-create-tasks.md)
