# How to Complete the Bootstrap Checklist

## Overview

This guide enables AI assistants to systematically complete the Bootstrap Checklist and generate all adopted technical standards for a project. The process transforms high-level product requirements into concrete technical implementation guidelines that serve as authoritative context during vibecoding sessions.

**Key Benefits:**

- Establishes comprehensive technical foundations from PRD and business requirements
- Creates consistent, validated technical standards across all project domains
- Provides structured context files that enhance AI-assisted development quality
- Ensures alignment between business objectives and technical implementation decisions
- Enables systematic updates as the project evolves through different development phases

## AI Assistant Role Definition

The AI assistant acts as a **Senior Technical Architect** with the following responsibilities:

- Analyze business requirements and translate them into technical decisions
- Propose appropriate project categorization based on scale, budget, and complexity
- Generate comprehensive technical standards covering all development aspects
- Facilitate collaborative review cycles with developers for validation and refinement
- Maintain consistency across all adopted standards documents
- Update technical standards based on ADR decisions and iterative development learnings

## Step-by-Step Implementation Process

### Step 1: Foundation Analysis

**Objective**: Gather and analyze existing project documentation to understand business context and technical requirements.

**Process**:

1. Read the [Bootstrap Checklist](../../assets/bootstrap-checklist.md) to understand all required technical decisions
2. Analyze existing documentation:
   - [`.pair/product/adopted/PRD.md`](.pair/product/adopted/PRD.md) - Product Requirements and business objectives
   - [`.pair/product/backlog/01-initiatives`](.pair/product/backlog/01-initiatives) - Strategic initiatives and business priorities
   - [`.pair/tech/adr/`](.pair/tech/adr/) - Existing Architecture Decision Records
3. Extract key information:
   - Target user base and expected scale
   - Budget constraints and timeline requirements
   - Team size, skills, and organizational context
   - Technical constraints and integration requirements
   - Compliance and security requirements

### Step 2: Project Categorization

**AI Assistant Instructions:** Analyze the project characteristics and propose categorization:

**Process**:

1. **Evaluate project indicators** from PRD and context analysis:

   - Team size and organizational structure
   - Budget constraints and funding model
   - Timeline pressures and market requirements
   - Compliance and integration complexity
   - Scale expectations and growth projections

2. **Present categorization proposal** to developer:

_"Based on my analysis of your PRD and project context, I believe this project fits **[Type X]** categorization. Here's my reasoning:_

_- **Budget/Resources**: [specific evidence from analysis]_
_- **Team Structure**: [team size and composition]_  
_- **Scale Requirements**: [user base and performance needs]_
_- **Complexity**: [integration and compliance factors]_

_This suggests a **[Type X: Category Name]** approach focusing on [key focus areas]. Does this categorization align with your project vision, or would you like me to consider a different category?"_

3. **Handle categorization feedback**:
   - If confirmed: Proceed to checklist completion
   - If questioned: Re-explain all three categories with specific examples
   - If changed: Ask for specific reasoning to refine future analysis

**Follow-up if categorization is challenged:**
_"Let me clarify all three project categories to ensure we choose the right approach:_

_- **Type A (Pet Project/PoC)**: Zero budget, 1-3 people, focus on speed and learning_
_- **Type B (Startup/Scale-up)**: Limited budget, 3-10 people, focus on time-to-market and future scalability_  
_- **Type C (Enterprise/Corporate)**: Structured budget, 10+ people, focus on governance, security, and compliance_

_Which category best describes your project's constraints and objectives?"_

### Step 3: Checklist Completion

**AI Assistant Instructions:** Systematically work through each checklist section with targeted questions:

**Process**:

1. **Start with Architecture Assessment:**

_"Now I'll work through the Bootstrap Checklist systematically. Starting with Architecture - I need to understand your scale and integration requirements:_

_Based on your PRD, I can see [specific evidence from PRD analysis], but I need clarification on:_
_- **Expected concurrent users**: What's your target for simultaneous active users?_
_- **Data volume estimates**: How much data will you be processing/storing initially and at scale?_
_- **Integration requirements**: Which existing systems need to connect to your platform?_
_- **Compliance needs**: Are there specific regulations (GDPR, SOC2, HIPAA) you must meet?"_

2. **Proceed to Tech Stack Analysis:**

_"Great! Based on those architecture requirements, let's discuss technology choices. From your team information, I understand [team composition], but I need to verify:_
_- **Current team technical strengths**: What technologies is your team most proficient with?_
_- **Learning capacity**: How much time can the team dedicate to learning new technologies?_
_- **Operational preferences**: Do you prefer managed services or self-hosted solutions?_
_- **Performance requirements**: What are your target response times and throughput?"_

3. **Continue with UX/UI Requirements:**

_"For user experience decisions, I've identified [user personas from PRD], but need specifics on:_
_- **Device/browser targets**: Which platforms must you support (mobile, desktop, specific browsers)?_
_- **Accessibility requirements**: What accessibility standards must you meet?_
_- **Design system needs**: Do you have existing brand guidelines or need to create new ones?_
_- **Content management**: Who will manage content and how frequently will it change?"_

4. **Finalize with Way of Working:**

_"Finally, for development processes, considering your [team size] team, I need to understand:_
_- **Release frequency**: How often do you plan to deploy updates?_
_- **Quality standards**: What level of testing and code review do you want to implement?_
_- **Risk tolerance**: How do you want to handle deployment risks and rollbacks?_
_- **Documentation needs**: What level of documentation does your team require?"_

**For Missing Information:**
_"I couldn't determine the following items from your existing documentation. Could you provide clarity on:_
_[Present questions in logical groups, max 4-5 questions at a time]_
_- [Specific question with context]_
_- [Specific question with context]_
_- [Specific question with context]_"

### Step 4: Checklist Review and Validation

**AI Assistant Instructions:** Present completed checklist for comprehensive review:

**Process**:

1. **Present organized checklist summary:**

_"I've completed the Bootstrap Checklist based on your project requirements. Here's a comprehensive summary organized by domain:_

**Architecture Decisions:**
_- Scale: [X concurrent users, Y data volume] → Decision: [architectural pattern]_
_- Integration: [specific systems] → Decision: [integration approach]_  
_- Compliance: [requirements] → Decision: [security measures]_

**Technology Stack:**
_- Frontend: [chosen technology] (rationale: [team skills + project needs])_
_- Backend: [chosen technology] (rationale: [performance + maintenance])_
_- Database: [chosen technology] (rationale: [data patterns + scale])_
_- Infrastructure: [chosen approach] (rationale: [budget + complexity])_

**UX/UI Approach:**
_- Design System: [approach] (rationale: [brand + development speed])_
_- Accessibility: [standards] (rationale: [compliance + user base])_
_- Device Support: [platforms] (rationale: [user research + resources])_

**Development Process:**
_- Release Cycle: [frequency] (rationale: [business needs + team capacity])_
_- Quality Gates: [testing levels] (rationale: [risk tolerance + resources])_
_- Team Structure: [workflow] (rationale: [size + collaboration needs])_

_Are there any decisions you'd like to modify or areas where you'd like different options?"_

2. **Handle feedback systematically:**

_"I'll update the following based on your feedback:_
_- [Specific change 1]: [old decision] → [new decision]_
_- [Specific change 2]: [old decision] → [new decision]_

_This means I also need to adjust related decisions for consistency:_
_- [Related impact 1]_
_- [Related impact 2]_

_Does this updated approach work better for your project?"_

3. **Confirm final approval:**

_"Perfect! Here's the final validated checklist. All decisions are consistent and aligned with your [Type X] project categorization. Shall I proceed to generate the five adopted standards documents based on these decisions?"_

### Step 5: Standards Document Generation

**Objective**: Create comprehensive adopted standards documents based on the completed checklist, ensuring strict compliance with the requirements in [adopted/README.md](../tech/adopted/README.md).

**Process**:

1. Generate draft versions of all five adopted standards documents:

   - `architecture.md` - System design and architectural decisions
   - `tech-stack.md` - Technology components with specific versions
   - `infrastructure.md` - Deployment and operational infrastructure
   - `ux-ui.md` - User experience patterns and design standards
   - `way-of-working.md` - Development processes and team workflows

2. Follow the [adopted standards requirements](../tech/adopted/README.md):
   - Write in English with concise, prescriptive language
   - Include only decisions and choices, not explanations
   - Reference knowledge-base documents for detailed rationale
   - Ensure self-consistency across all documents
   - Address all relevant checklist points

### Step 6: Document Review and Iteration

**AI Assistant Instructions:** Present each document individually with structured review cycles, ensuring at every step that the document is compliant with [adopted/README.md](../tech/adopted/README.md):

**Process for each document:**

**Round 1: Document Introduction**
_"I've created the draft for `[document-name].md`. This document covers [primary focus areas] and makes the following key decisions:_
_- [Key decision 1 with brief rationale]_
_- [Key decision 2 with brief rationale]_  
_- [Key decision 3 with brief rationale]_

_The document structure follows our adopted standards format as required by [adopted/README.md](../tech/adopted/README.md): concise, prescriptive, and compliant. Would you like to review the content, or do you have questions about any of these decisions?"_

**Round 2: Detailed Review**
_"Here's the complete `[document-name].md` for your review:_

_[Present document content or key sections]_

_I want to highlight a few areas where I'd particularly value your feedback:_
_- **[Section name]**: Does this accurately reflect your [specific concern]?_
_- **[Section name]**: Are these choices compatible with your [specific requirement]?_
_- **[Section name]**: Is this level of detail appropriate for your team's needs?_

_What adjustments would you recommend?"_

**Round 3: Iteration and Refinement**
_"Based on your feedback, I've updated:_
_- **[Specific change]**: [old approach] → [new approach]_
_- **[Specific change]**: Added [new element] to address [concern]_
_- **[Specific change]**: Clarified [ambiguous element]_

_I also verified that these changes maintain consistency with [related documents] and that the document remains fully compliant with [adopted/README.md](../tech/adopted/README.md). Does this version meet your standards?"_

**Round 4: Final Approval**
_"Here's the final version of `[document-name].md`. The document is now:_

- ✅ Complete with all required sections\*
- ✅ Consistent with other adopted standards\*
- ✅ Aligned with your project categorization\*
- ✅ Fully compliant with [adopted/README.md](../tech/adopted/README.md)\*
- ✅ Ready for implementation reference\*

_Should I save this to `.pair/tech/adopted/[document-name].md` and move to the next document?"_

**Document Sequence:**

1. Start with [`architecture.md`](.pair/tech/adopted/architecture.md) (foundation for others)
2. Continue with [`tech-stack.md`](.pair/tech/adopted/tech-stack.md) (depends on architecture)
3. Proceed to [`infrastructure.md`](.pair/tech/adopted/infrastructure.md) (depends on tech stack)
4. Follow with [`ux-ui.md`](.pair/tech/adopted/ux-ui.md)
5. Finish with [`way-of-working.md`](.pair/tech/adopted/way-of-working.md) (integrates all previous decisions)

### Step 7: Document Finalization and Storage

**Objective**: Save approved documents to the correct project locations.

**Process**:

1. Create or update each approved document in [`.pair/tech/adopted/`](.pair/tech/adopted/) folder:
   - [`architecture.md`](.pair/tech/adopted/architecture.md)
   - [`infrastructure.md`](.pair/tech/adopted/infrastructure.md)
   - [`tech-stack.md`](.pair/tech/adopted/tech-stack.md)
   - [`ux-ui.md`](.pair/tech/adopted/ux-ui.md)
   - [`way-of-working.md`](.pair/tech/adopted/way-of-working.md)
2. Ensure all documents follow the established format and standards
3. Verify internal consistency across all documents
4. Create summary of completed work for project records

### Step 8: Iterative Updates Process

**AI Assistant Instructions:** Maintain standards throughout project evolution:

**During Strategic Preparation Phase:**
_"I'm monitoring the ADR decisions and subdomain analysis progress. I notice [specific ADR/decision] that impacts our adopted standards:_
_- **Architecture Impact**: [specific change needed]_
_- **Tech Stack Impact**: [version updates or new tools]_
_- **Rationale**: [why this change is necessary]_

_Should I update the [`architecture.md`](.pair/tech/adopted/architecture.md) and [`tech-stack.md`](.pair/tech/adopted/tech-stack.md) files to reflect these new decisions, or would you prefer to review the changes first?"_

**During Customer-Facing Iterations:**
_"Based on the completed sprint and user feedback, I've identified potential updates to our standards:_
_- **UX/UI Changes**: [design system updates based on user testing]_  
_- **Infrastructure Changes**: [deployment improvements from production experience]_
_- **Performance Insights**: [optimization learnings]_

_These learnings suggest updates to [`ux-ui.md`](.pair/tech/adopted/ux-ui.md) and [`infrastructure.md`](.pair/tech/adopted/infrastructure.md). Would you like me to propose specific changes?"_

**During Continuous Value Delivery:**
_"Our sprint retrospectives and task execution have revealed process improvements:_
_- **Code Review Process**: [efficiency improvements discovered]_
_- **Testing Strategy**: [coverage and automation learnings]_  
_- **Deployment Workflow**: [cycle time optimizations]_

_I recommend updating [`way-of-working.md`](.pair/tech/adopted/way-of-working.md) to reflect these proven practices. Should I draft these updates?"_

**ADR-Driven Update Process:**

1. **Monitor new ADRs** for impact on adopted standards
2. **Identify affected documents** and specific sections
3. **Propose updates** with change rationale:

_"New ADR-[XXX] '[ADR Title]' affects our adopted standards:_
_- **Document**: `[affected-file].md`_  
_- **Section**: [specific section name]_
_- **Current Standard**: [existing decision]_
_- **Required Update**: [new decision from ADR]_
_- **Consistency Check**: [impact on other documents]_

_Should I update [`[affected-file].md`](.pair/tech/adopted/[affected-file].md) to align with this ADR decision?"_

4. **Maintain version consistency** across all related documents
5. **Document change rationale** for future reference

## Best Practices

### Do's for AI Assistants

- **Always start with comprehensive analysis** of PRD, existing initiatives, and ADRs before proposing any technical decisions
- **Present categorization with clear rationale** and specific evidence from project analysis
- **Ask focused, contextual questions** when information is missing, referencing specific PRD sections or business requirements
- **Use structured communication templates** to ensure consistent developer interaction patterns
- **Validate assumptions explicitly** through targeted questions rather than making silent presumptions
- **Present documents individually** with clear explanation of key decisions and rationale
- **Maintain strict version consistency** across all adopted standards documents when making updates
- **Reference existing project context** (ADRs, way-of-working phases) when proposing changes
- **Provide specific examples** when explaining project categorizations or technical choices
- **Follow the 🤖🤝👨‍💻 model** (LLM proposes, Developer validates) throughout all interactions
- **Save all relevant documents** in the correct `.pair/tech/adopted/` locations following the structure asked in this document

### Don'ts for AI Assistants

- **Never skip foundational analysis** - always read PRD, initiatives, and ADRs before starting the process
- **Don't assume project constraints** - always validate budget, timeline, team skills, and compliance requirements
- **Don't present all documents simultaneously** - use iterative review cycles for quality and engagement
- **Don't ignore project categorization** - let Type A/B/C guide all technology and process decisions
- **Don't make technology choices without rationale** - always connect decisions to project constraints and requirements
- **Don't create inconsistent standards** - verify compatibility of versions, approaches, and methodologies across all documents
- **Don't update standards without developer approval** - follow collaborative validation for all changes
- **Don't skip the iterative update process** - maintain standards alignment throughout project evolution
- **Don't rush through checklist completion** - ensure each section is thoroughly addressed before proceeding
- **Don't break the collaborative model** - maintain developer engagement and validation throughout the process
- **Don't save a output file of the completed checklist** - always create the final adoption documents in the correct `.pair/tech/adopted/` locations

## Quality Assurance Checklist

- [ ] Bootstrap checklist fully completed with all items addressed
- [ ] Project categorization confirmed and documented with developer approval
- [ ] All five adopted standards documents generated and approved
- [ ] Internal consistency verified across all documents (compatible versions, aligned approaches)
- [ ] All documents follow adopted standards format requirements (concise, prescriptive, English)
- [ ] Technology choices align with project categorization, budget, and team constraints
- [ ] All missing information gathered through specific developer questions
- [ ] Documents stored in correct [`.pair/tech/adopted/`](.pair/tech/adopted/) locations
- [ ] Update process established for future iterations and ADR-driven changes
- [ ] Knowledge-base references included where appropriate for detailed explanations

## Common Pitfalls and Solutions

| Pitfall                                           | Impact                                                  | Solution                                                                  |
| ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Skipping project categorization                   | Inappropriate technology choices for scale/budget       | Always complete categorization first and validate with developer          |
| Making assumptions about missing information      | Incorrect technical decisions                           | Ask specific questions and wait for developer confirmation                |
| Inconsistent technology versions across documents | Runtime conflicts and integration issues                | Create technology compatibility matrix and validate all versions          |
| Including explanations in adopted standards       | Documents become verbose and lose authoritative clarity | Move rationale to knowledge-base, keep standards concise and prescriptive |
| Proceeding without developer validation           | Misaligned technical decisions                          | Implement review cycles at each step with explicit approvals              |
| Choosing technologies mismatched to team skills   | Development velocity and quality issues                 | Analyze team competencies before technology selection                     |
| Ignoring budget constraints                       | Unsustainable operational costs                         | Match technology choices to project categorization and budget reality     |
| Generating all documents simultaneously           | Overwhelming review process                             | Present one document at a time for focused feedback                       |

## References

### Core Documentation

- [Bootstrap Checklist](../../assets/bootstrap-checklist.md) - Complete project setup and categorization framework
- [Adopted Standards README](../tech/adopted/README.md) - Requirements and format for all adopted documents
- [Way of Working](../tech/adopted/way-of-working.md) - Development lifecycle and iteration processes
- [PRD Template](../../product/adopted/PRD.md) - Product requirements and business context
- [Architecture Decision Records](../tech/adr/) - Existing technical decisions and rationale

### Knowledge Base Guidelines

- [Architectural Guidelines](../tech/knowledge-base/01-architectural-guidelines.md) - Detailed architectural patterns and principles
- [Technical Guidelines](../tech/knowledge-base/03-technical-guidelines.md) - Technology selection criteria and best practices
- [Infrastructure Guidelines](../tech/knowledge-base/04-infrastructure-guidelines.md) - Deployment and operational guidance
- [UX Guidelines](../tech/knowledge-base/05-ux-guidelines.md) - User experience and design system principles

### Process References

- [Task Creation Guide](09-how-to-create-tasks.md) - Connection to development execution phase
- [Definition of Done](../tech/knowledge-base/06-definition-of-done.md) - Quality standards for implementation
- [Testing Strategy](../tech/knowledge-base/07-testing-strategy.md) - Testing approaches and automation requirements
