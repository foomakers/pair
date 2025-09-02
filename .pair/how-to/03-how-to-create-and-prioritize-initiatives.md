# How to Create and Prioritize Initiatives - AI-Assisted Guide

## Overview

This guide enables developers and AI assistants to collaboratively create comprehensive Strategic Initiatives from Product Requirements Documents (PRDs) through a structured, iterative process. Strategic Initiatives serve as the bridge between product vision and executable development work, ensuring business alignment, clear value delivery, and optimal resource allocation.

**Key Benefits of Well-Defined Strategic Initiatives:**

- Transform product vision into actionable development streams
- Establish clear business value and priority hierarchy
- Provide measurable objectives and success criteria
- Enable effective resource planning and timeline management
- Create alignment between technical implementation and strategic goals
- Facilitate risk assessment and mitigation planning

## AI Assistant Role Definition

**Primary Role**: Strategic Initiative Architect

The AI assistant acts as a **Strategic Initiative Architect** who:

- **Analyzes** the PRD to identify key value streams and business objectives
- **Proposes** initiative structure, priority, and business rationale
- **Facilitates** collaborative refinement through targeted questions and feedback loops
- **Documents** initiatives with comprehensive templates and clear specifications
- **Plans** initiative timeline and dependencies for optimal execution
- **Maintains** initiative documentation and numbering consistency

**Working Principles**: Follow the **🤖🤝👨‍💻** model (LLM proposes, Developer validates) throughout the entire process.

## Prerequisite

Before starting, **read and consult the Initiative Template**: [Initiative Template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md). All required structure and fields are defined in the template.

## **Issue Access and Tool Integration**

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks. NEVER deviate from this process.**

### **Access Protocol**

**Step 1: Tool Configuration Check**

1. **Read** [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:

_"I cannot proceed because no project management tool is configured in [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md). Complete bootstrap first: [How to Complete Bootstrap Checklist](./02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) for all access procedures
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
- [ ] [Project Management Tool Guidelines](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) consulted for access procedures

## Initiative Template Structure

Each initiative must follow the comprehensive [template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md)

Step 0: Bootstrap Checklist Validation
AI Assistant Instructions: Before beginning epic breakdown, verify that all foundational documents exist:

Required Documentation Check:

Verify Bootstrap Completion: Check for existence of:

.pair/product/adopted/PRD.md
.pair/adoption/product/backlog/01-initiatives/ (with initiative files)
.pair/product/adopted/subdomain/
.pair/way-of-working.md
.pair/adoption/tech/architecture.md
.pair/adoption/tech/tech-stack.md
.pair/adoption/tech/infrastructure.md
.pair/adoption/tech/ux-ui.md
.pair/adoption/tech/way-of-working.md
Check Tool Configuration: Verify project management tool is configured in .pair/adoption/tech/way-of-working.md

If Bootstrap Not Complete: "I notice the bootstrap checklist hasn't been completed yet. Before we can break down epics, we need to establish the foundational documentation and tool configuration. Please complete the 'How to Complete the Bootstrap Checklist' process first, then return here for create and prioritize initiatives."

If Tool Not Configured: "I can see the foundational documents are ready, but I need to confirm the project management tool configuration. According to .pair/adoption/tech/way-of-working.md, we should be using [TOOL_NAME]. Should I proceed with documenting epics in this tool?"

## Step-by-Step Implementation Process

### Step 0: Project Management Tool Verification

**AI Assistant Instructions:** Before beginning initiative creation, verify the project management setup:

1. **Check [`.pair/adoption/tech/way-of-working.md`](.pair/adoption/tech/way-of-working.md)** to identify the defined project management tool
2. **Read ([Project Management Framework](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md))** to understand how to operate with the project management tool and the relative guidelines of the tool you adopt
3. **Read adoption file**: [.pair/adoption/tech/README.md](.pair/adoption/tech/README.md)
   - [.pair/adoption/tech/architecture.md](.pair/adoption/tech/architecture.md)
   - [.pair/adoption/tech/tech-stack.md](.pair/adoption/tech/tech-stack.md)
   - [.pair/adoption/tech/infrastructure.md](.pair/adoption/tech/infrastructure.md)
   - [.pair/adoption/tech/ux-ui.md](.pair/adoption/tech/ux-ui.md)
   - [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md)
4. **If tool is already defined**: Proceed with that tool's methodology for initiative management
5. **If no tool is defined**: Follow the collaborative selection process from `./02-how-to-complete-bootstrap-checklist.md`

**Tool Selection Process (if needed):**

Present to developer:
_"I need to understand your project management setup before creating initiatives. I don't see a defined project management tool in your way-of-working document. Would you prefer to use:_

- _**File-based system** (initiatives stored as markdown in your file system)_
- _**GitHub Projects** (initiatives managed within GitHub's project management features)_
- _**External tool integration** (Jira, Linear, etc.)_

_This choice will determine how we structure and manage your strategic initiatives. What's your preference?"_

Based on the selection, update `.pair/adoption/tech/way-of-working.md` accordingly and proceed.

### Step 1: Reference Analysis and Context Building

**AI Assistant Instructions:** Begin by analyzing the foundational documents:

1. **Review [`.pair/product/adopted/PRD.md`](.pair/product/adopted/PRD.md)** to understand product vision, goals, and requirements
2. **Study [`.pair/way-of-working.md`](.pair/way-of-working.md)** to understand the development methodology and value streams
3. **Check existing initiatives** according to the defined project management approach:
   - **File System**: ([see File System Guidelines](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework-filesystem.md))
   - **Github Tools**: ([see Github System Guidelines](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework-filesystem.md))
4. **Create initiative analysis framework** based on PRD goals and way-of-working principles

Your analysis should extract:

- Primary business objectives from the PRD
- User pain points and value propositions
- Technical requirements and constraints
- Success metrics and timelines
- Risk factors and dependencies

### Step 2: Initiative Identification and Prioritization

**AI Assistant Instructions:** Based on PRD analysis, create a comprehensive initiative overview adapted to the chosen project management approach:

1. **Identify all potential initiatives** that could deliver the PRD objectives
2. **Apply prioritization framework** using:
   - **Business Impact**: Direct connection to PRD goals and user value
   - **Technical Feasibility**: Implementation complexity and risk assessment
   - **Market Timing**: Urgency and competitive positioning
   - **Resource Requirements**: Effort estimation and team capacity
3. **Create priority matrix** adapted to chosen tool capabilities:
   - **File System**: Use P0/P1/P2 classification with detailed rationale
   - **External Tools**: Leverage tool's native priority/scoring system (e.g., Jira Priority, Linear Priority scales)
4. **Propose initial initiative list** formatted for the chosen approach

**Presentations:**

_"Based on the PRD analysis, I've identified [X] strategic initiatives that would deliver your product objectives. Here's the prioritization framework I used and the resulting P0/P1/P2 classification. Would you like to review this prioritization approach before we dive into individual initiatives?"_

### Step 3: Individual Initiative Development

**AI Assistant Instructions:** For each initiative, following priority order and adapting to chosen tool:

1. **Present initiative concept** with initial [template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md) draft formatted for the chosen approach
2. **Request specific feedback** on:
   - Business rationale accuracy
   - Scope definition completeness
   - Risk assessment coverage
   - Tool-specific field requirements (labels, components, assignees, etc.)
3. **Iterate based on feedback** until developer approval
4. **Prepare for creation** in chosen system

**Tool-Specific Iteration Process per Initiative:**

**File System Approach:**

**Round 1: Concept Validation**
_"Here's my draft for Initiative: [Name] following our markdown template. I've focused on [key aspects]. Does this accurately capture the business value and scope you envision? What would you adjust?"_

**Round 2: Detail Refinement**
_"Based on your feedback, I've updated [specific sections]. Are the success metrics measurable enough? Do the risks and mitigations look comprehensive for our file-based tracking?"_

**Round 3: Final Approval**
_"Here's the refined initiative. Does this provide sufficient detail for epic breakdown and development planning? Should I create the markdown file?"_

**External Tools Approach:**

**Round 1: Concept Validation**
_"Here's my draft for Initiative: [Name] structured for [Tool Name]. I've mapped our template to [Tool's fields/structure]. Does this capture the business value correctly? How should we handle [specific tool considerations]?"_

**Round 2: Detail Refinement**
_"I've updated the initiative based on your feedback. I've structured the detailed content for [Tool's description/attachment system]. Are the [tool-specific priority/labels/components] set correctly?"_

**Round 3: Final Approval**
_"Here's the refined initiative ready for [Tool Name]. The comprehensive details are structured for [tool's format], and I've set [tool-specific metadata]. Should I create this in [Tool Name]?"_

### Step 4: Initiative Documentation

**AI Assistant Instructions:** Upon developer approval, create documentation according to the defined project management approach:

**For File System Approach ([see File System Guidelines](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework-filesystem.md))**

**For Github Tool Approach ([see Github System Guidelines](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework-filesystem.md))**:

1. **Create initiative item** in the chosen project management tool
2. **Include comprehensive [template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md) content** adapted to the tool's structure
3. **Maintain cross-references** between tool items and any supporting documentation
4. **Ensure tool-specific fields** (priority, labels, assignees) are properly set
5. **Confirm creation** with developer and move to next initiative

### Step 5: Master Planning and Sequencing

**AI Assistant Instructions:** After all initiatives are documented, create master planning adapted to chosen approach:

1. **Analyze initiative dependencies** and resource requirements
2. **Create master timeline** considering:
   - Initiative duration estimates
   - Team capacity constraints
   - Dependency relationships
   - Risk mitigation buffers
3. **Structure timeline** according to chosen tool capabilities:
   - **File System**: Create comprehensive timeline documents with dependency matrices
   - **External Tools**: Use tool's native roadmap/timeline features (Jira Roadmaps, Linear Roadmap, etc.)
4. **Present planning rationale** formatted for chosen approach

**Presentations:**

_"I've created all initiatives in [Tool Name]. Here's the roadmap I've built using [Tool's roadmap features]. I've set up dependencies using [Tool's dependency system] and timeline using [Tool's timeline features]. The plan assumes [capacity assumptions]. How should we adjust this roadmap?"_

### Step 6: Timeline Review and Finalization

**AI Assistant Instructions:** Based on developer feedback:

1. **Adjust timeline** according to feedback
2. **Update initiative documentation** with final planned dates according to chosen tool
3. **Apply numerical/organizational structure** based on execution sequence and tool capabilities
4. **Update existing initiatives** if reorganization is needed
5. **Create master initiative overview** appropriate for the chosen tool

**Organization Conventions:**
([see Collaboration and Process Guidelines for organization conventions](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md))

### Step 7: Final Documentation and Handoff

**AI Assistant Instructions:** Complete the process by:

1. **Verify all initiative documentation** is properly created according to chosen approach
2. **Confirm timeline consistency** across all initiatives and chosen tool
3. **Create initiative summary** with overview of all initiatives (format depends on tool choice)
4. **Prepare for epic breakdown** phase transition with proper tool integration

**Handoff Checklist:**

- [ ] Project management tool verified and configured
- [ ] All initiatives documented using complete [template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md)
- [ ] Initiative organization follows tool-specific best practices
- [ ] Timeline dependencies clearly mapped in appropriate system
- [ ] Success metrics are measurable and time-bound
- [ ] Risks and mitigations are specific and actionable
- [ ] Scope boundaries are clearly defined
- [ ] Tool integration ready for epic breakdown phase

## Quality Assurance Framework

### Initiative Quality Standards

**Content Quality:**

- [ ] Objective clearly states measurable business outcome
- [ ] Business rationale connects to PRD goals and user value
- [ ] Key results are specific, measurable, and time-bound
- [ ] Success metrics include target values and measurement methods
- [ ] Scope definition explicitly states inclusions and exclusions
- [ ] Risk assessment covers technical, business, and resource risks
- [ ] Timeline hypothesis is realistic and considers dependencies

**Structure Quality:**

- [ ] All [template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md) sections are completed comprehensively
- [ ] Information flows logically between sections
- [ ] Terminology is consistent with PRD and way-of-working
- [ ] Document formatting matches [template](../tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md) standard
- [ ] File naming and organization follows conventions

**Business Alignment:**

- [ ] Initiative directly supports PRD objectives
- [ ] Priority aligns with business impact and feasibility
- [ ] Resource requirements are realistic and justified
- [ ] Timeline considers team capacity and other initiatives
- [ ] Success criteria enable clear go/no-go decisions

### Prioritization Validation

Before finalizing prioritization, verify:

- **P0 Initiatives**: Launch blockers that enable core value proposition
- **P1 Initiatives**: Competitive advantages that drive growth
- **P2 Initiatives**: Enhancements that improve retention and experience
- **Dependencies**: Higher priority initiatives don't depend on lower priority ones
- **Resource Balance**: P0 initiatives don't overwhelm available capacity
- **Value Stream**: Each initiative clearly contributes to defined value streams

## Best Practices for AI Assistants

### Do's:

- **Always start with comprehensive PRD analysis** to understand full context
- **Always follow tool management instructions provided by the (Collaboration and Process Guidelines for organization conventions](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) based on the chosen project management tool from the adoption** to ensure a consistent approach
- **Focus on one initiative at a time** to ensure quality and developer engagement
- **Be specific about business value** and connect to measurable outcomes
- **Include concrete risk mitigation strategies** rather than generic statements
- **Maintain consistency** in terminology and formatting across all initiatives
- **Validate assumptions** through targeted questions rather than presumptions
- **Consider resource constraints** when proposing timelines and scope

### Don'ts:

- **Never create initiatives without PRD analysis**
- **Never skip the tool management instructions** - inconsistent approaches cause confusion
- **Never use a different tool management of the one defined in the adoption file**
- **Don't assume business priorities** without developer validation
- **Don't skip the scope definition** - unclear boundaries cause project failures
- **Don't underestimate dependencies** between initiatives
- **Don't ignore existing initiative numbering** when adding new ones
- **Don't finalize timelines** without considering team capacity
- **Don't create initiatives that can't be measured** for success

## Common Pitfalls and Solutions

| Pitfall                     | Impact                            | Solution                                                     |
| --------------------------- | --------------------------------- | ------------------------------------------------------------ |
| **Vague objectives**        | Unclear success criteria          | Use specific, measurable language with concrete outcomes     |
| **Scope creep risk**        | Timeline and resource overruns    | Explicitly define out-of-scope items                         |
| **Unrealistic timelines**   | Team burnout and missed deadlines | Include buffer time and validate with team capacity          |
| **Missing dependencies**    | Initiative blocking and delays    | Map all technical, resource, and business dependencies       |
| **Weak business rationale** | Lack of stakeholder buy-in        | Connect each initiative to specific PRD goals and user value |

---

## References

- [Project Management Tool Guidelines](../tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md)
- [`.pair/adoption/tech/way-of-working.md`](.pair/adoption/tech/way-of-working.md) - Contains project management tool definition and methodology
- [`.pair/product/adopted/PRD.md`](.pair/product/adopted/PRD.md) - Product Requirements Document containing business objectives and requirements
- [`./02-how-to-complete-bootstrap-checklist.md`](./02-how-to-complete-bootstrap-checklist.md) - Process for collaborative tool selection when not pre-defined
- [`.pair/adoption/product/backlog/01-initiatives/`](.pair/adoption/product/backlog/01-initiatives/) - Directory for storing initiative documentation (if using file system approach)

**Process Dependencies:**

- This process must be completed before Epic Breakdown can begin
- Initiatives serve as input for the next phase of development planning
- All initiatives must be approved and documented before timeline finalization

This guide ensures a thorough, collaborative process that produces high-quality Strategic Initiatives ready for Epic breakdown and successful product development implementation.
