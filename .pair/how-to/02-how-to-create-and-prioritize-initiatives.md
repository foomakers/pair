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

## Initiative Template Structure

Each initiative must follow this comprehensive template:

```markdown
# Initiative [Number]: [Initiative Name]

## Overview
**Duration**: [X-Y sprints]
**Business Value**: [Product Foundation | Business Value | User Experience | Working Software]
**Priority**: [P0 | P1 | P2]
**Planned Start**: [YYYY-MM-DD]
**Planned End**: [YYYY-MM-DD]

## Objective
[Clear statement of what this initiative aims to achieve]

## Business Rationale
[Why this initiative is important for the business and users]

## Key Results
- ✅ [Measurable outcome 1]
- ✅ [Measurable outcome 2]
- ✅ [Measurable outcome 3]
- ✅ [Measurable outcome 4]

## Success Metrics
- **[Metric Name]**: Target [target value]
- **[Metric Name]**: Target [target value]
- **[Metric Name]**: Target [target value]

## Scope Definition

### In Scope
- [Specific functionality/feature included]
- [Another included element]
- [Additional included capability]

### Out of Scope
- [Explicitly excluded functionality]
- [Another excluded element]
- [Future consideration item]

## Risk Assessment

| Risk | Impact | Probability | Mitigation Strategy |
|------|---------|-------------|-------------------|
| [Risk 1] | High/Medium/Low | High/Medium/Low | [Specific mitigation approach] |
| [Risk 2] | High/Medium/Low | High/Medium/Low | [Specific mitigation approach] |

## Dependencies
- **Internal**: [Dependencies on other initiatives/teams]
- **External**: [Dependencies on third parties/systems]
- **Technical**: [Technical prerequisites or constraints]

## Resource Requirements
- **Development**: [Estimated developer effort]
- **Design**: [Design resource needs]
- **Other**: [Additional resource requirements]

## Timeline Hypothesis
- **Sprint 1-2**: [Phase 1 activities]
- **Sprint 3-4**: [Phase 2 activities]
- **Sprint 5-6**: [Phase 3 activities]
- **Sprint 7-8**: [Final phase activities]

## Epic Breakdown Preview
1. **Epic 1**: [Brief epic description]
2. **Epic 2**: [Brief epic description]
3. **Epic 3**: [Brief epic description]
```

## Step-by-Step Implementation Process

### Step 1: Reference Analysis and Context Building

**AI Assistant Instructions:** Begin by analyzing the foundational documents:

1. **Review [`.pair/product/adopted/PRD.md`](.pair/product/adopted/PRD.md)** to understand product vision, goals, and requirements
2. **Study [`.pair/way-of-working.md`](.pair/way-of-working.md)** to understand the development methodology and value streams
3. **Check existing initiatives** in [`.pair/product/backlog/01-initiatives/`](.pair/product/backlog/01-initiatives/) to understand current numbering and avoid conflicts
4. **Create initiative analysis framework** based on PRD goals and way-of-working principles

Your analysis should extract:
- Primary business objectives from the PRD
- User pain points and value propositions
- Technical requirements and constraints
- Success metrics and timelines
- Risk factors and dependencies

### Step 2: Initiative Identification and Prioritization

**AI Assistant Instructions:** Based on PRD analysis, create a comprehensive initiative overview:

1. **Identify all potential initiatives** that could deliver the PRD objectives
2. **Apply prioritization framework** using:
   - **Business Impact**: Direct connection to PRD goals and user value
   - **Technical Feasibility**: Implementation complexity and risk assessment
   - **Market Timing**: Urgency and competitive positioning
   - **Resource Requirements**: Effort estimation and team capacity
3. **Create priority matrix** with clear scoring rationale
4. **Propose initial initiative list** with P0/P1/P2 classification

Present to developer:
_"Based on the PRD analysis, I've identified [X] strategic initiatives that would deliver your product objectives. Here's the prioritization framework I used and the resulting initiative priorities. Would you like to review this prioritization approach before we dive into individual initiatives?"_

### Step 3: Individual Initiative Development

**AI Assistant Instructions:** For each initiative, following priority order:

1. **Present initiative concept** with initial template draft
2. **Request specific feedback** on:
   - Business rationale accuracy
   - Scope definition completeness
   - Risk assessment coverage
3. **Iterate based on feedback** until developer approval
4. **Create initiative file** in [`.pair/product/backlog/01-initiatives/[YYYY]/`](.pair/product/backlog/01-initiatives/)

**Iteration Process per Initiative:**

**Round 1: Concept Validation**
_"Here's my draft for Initiative: [Name]. I've focused on [key aspects]. Does this accurately capture the business value and scope you envision? What would you adjust?"_

**Round 2: Detail Refinement**
_"Based on your feedback, I've updated [specific sections]. Are the success metrics measurable enough? Do the risks and mitigations look comprehensive?"_

**Round 3: Final Approval**
_"Here's the refined initiative. Does this provide sufficient detail for epic breakdown and development planning? Should I create the initiative file?"_

### Step 4: Initiative Documentation

**AI Assistant Instructions:** Upon developer approval:

1. **Create initiative file** using naming convention: `[initiative-name].md`
2. **Save in appropriate year folder**: [`.pair/product/backlog/01-initiatives/[YYYY]/`](.pair/product/backlog/01-initiatives/)
3. **Apply complete template** with all sections filled
4. **Confirm file creation** with developer
5. **Move to next initiative** in priority order

**File Organization:**
```
.pair/product/backlog/01-initiatives/
├── 2025/
│   ├── core-data-pipeline.md
│   ├── unified-portfolio-experience.md
│   └── multi-broker-integration.md
└── [YYYY]/
    └── [future initiatives]
```

### Step 5: Master Planning and Sequencing

**AI Assistant Instructions:** After all initiatives are documented:

1. **Analyze initiative dependencies** and resource requirements
2. **Create master timeline** considering:
   - Initiative duration estimates
   - Team capacity constraints
   - Dependency relationships
   - Risk mitigation buffers
3. **Propose execution sequence** with start/end dates
4. **Present planning rationale** to developer

**Planning Presentation:**
_"I've created all initiatives. Here's my recommended execution plan based on dependencies, resource requirements, and business priorities. The timeline assumes [team size/capacity assumptions]. What adjustments would you make to this plan?"_

### Step 6: Timeline Review and Finalization

**AI Assistant Instructions:** Based on developer feedback:

1. **Adjust timeline** according to feedback
2. **Update initiative files** with final planned dates
3. **Apply numerical prefixes** based on execution sequence
4. **Update existing initiatives** if numbering changes are needed
5. **Create master initiative index** for reference

**Numbering Convention:**
- Check existing initiatives for current numbering
- Continue numerical sequence: `01-`, `02-`, `03-`, etc.
- Update filenames: `01-core-data-pipeline.md`
- Maintain chronological order based on planned start dates

### Step 7: Final Documentation and Handoff

**AI Assistant Instructions:** Complete the process by:

1. **Verify all initiative files** are properly created and numbered
2. **Confirm timeline consistency** across all initiatives
3. **Create initiative summary** with overview of all initiatives
4. **Prepare for epic breakdown** phase transition

**Handoff Checklist:**
- [ ] All initiatives documented using complete template
- [ ] Files properly numbered and organized by year
- [ ] Timeline dependencies clearly mapped
- [ ] Success metrics are measurable and time-bound
- [ ] Risks and mitigations are specific and actionable
- [ ] Scope boundaries are clearly defined
- [ ] Ready for epic breakdown phase

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
- [ ] All template sections are completed comprehensively
- [ ] Information flows logically between sections
- [ ] Terminology is consistent with PRD and way-of-working
- [ ] Document formatting matches template standard
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
- **Focus on one initiative at a time** to ensure quality and developer engagement
- **Be specific about business value** and connect to measurable outcomes
- **Include concrete risk mitigation strategies** rather than generic statements
- **Maintain consistency** in terminology and formatting across all initiatives
- **Validate assumptions** through targeted questions rather than presumptions
- **Consider resource constraints** when proposing timelines and scope

### Don'ts:

- **Never create initiatives without PRD analysis**
- **Don't assume business priorities** without developer validation
- **Don't skip the scope definition** - unclear boundaries cause project failures
- **Don't underestimate dependencies** between initiatives
- **Don't ignore existing initiative numbering** when adding new ones
- **Don't finalize timelines** without considering team capacity
- **Don't create initiatives that can't be measured** for success

## Common Pitfalls and Solutions

| Pitfall | Impact | Solution |
|---------|---------|-----------|
| **Vague objectives** | Unclear success criteria | Use specific, measurable language with concrete outcomes |
| **Scope creep risk** | Timeline and resource overruns | Explicitly define out-of-scope items |
| **Unrealistic timelines** | Team burnout and missed deadlines | Include buffer time and validate with team capacity |
| **Missing dependencies** | Initiative blocking and delays | Map all technical, resource, and business dependencies |
| **Weak business rationale** | Lack of stakeholder buy-in | Connect each initiative to specific PRD goals and user value |

---

## References

**Essential Files for AI Assistant:**

- [`.pair/product/adopted/PRD.md`](.pair/product/adopted/PRD.md) - Product Requirements Document containing business objectives and requirements
- [`.pair/way-of-working.md`](.pair/way-of-working.md) - Development methodology and value stream definitions  
- [`.pair/product/backlog/01-initiatives/`](.pair/product/backlog/01-initiatives/) - Directory for storing initiative documentation

**File Organization:**

- Initiative files are stored in yearly subdirectories: [`.pair/product/backlog/01-initiatives/[YYYY]/`](.pair/product/backlog/01-initiatives/)
- Numbering follows chronological execution order with prefixes: `01-`, `02-`, `03-`
- File naming convention: `[##-initiative-name].md`

**Process Dependencies:**

- This process must be completed before Epic Breakdown can begin
- Initiatives serve as input for the next phase of development planning
- All initiatives must be approved and documented before timeline finalization

This guide ensures a thorough, collaborative process that produces high-quality Strategic Initiatives ready for Epic breakdown and successful product development implementation.