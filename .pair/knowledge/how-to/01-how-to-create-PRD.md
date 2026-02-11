# How to Create a Product Requirements Document (PRD) - AI-Assisted Guide

## Overview

Transform product ideas into comprehensive Product Requirements Documents through collaborative analysis and structured information gathering.

**Role**: Product Manager (PRD Creation)
**Process**: 🤖🤝👨‍💻 (AI gathers & drafts, Developer validates & approves)

**CRITICAL FIRST STEP**: Before any PRD work begins, complete Phase 0: Template & Reference Analysis to understand structure and quality standards.

## Session State Management

**CRITICAL**: Maintain this context throughout PRD creation:

```
PRD CREATION STATE:
├── Product: [Product/Feature Name]
├── PRD Status: [template-analysis | info-gathering | drafting | review | approved]
├── Template: [reviewed: Yes/No from assets/PRD_template.md]
├── Example Quality: [analyzed: Yes/No from assets/PRD_example.md]
├── Info Checklist: [completed: X/Y sections]
├── Documentation: [available docs analyzed]
├── Target File: [.pair/adoption/product/PRD.md]
└── Next Action: [specific next step]
```

## Core Principles

### Template-First PRD Creation

- **Study reference materials FIRST** - analyze [PRD template](../assets/PRD_template.md) and [PRD example](../assets/PRD_example.md)
- **Follow template structure exactly** - use all sections from template
- **Match example quality standard** - specificity, metrics, professional tone
- **Create comprehensive information checklist** based on template sections
- **Target file**: [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)

**CRITICAL**: Before starting information gathering:

- **HALT if template not reviewed** - must understand structure first
- **HALT if example not analyzed** - must understand quality expectations
- **Create section-by-section checklist** from template
- **Do NOT proceed** without clear understanding of required content

## Implementation Workflow

### Phase 0: Template & Reference Analysis

**Before starting**: Review reference materials to understand structure and quality standards.

1. **Analyze template structure** from [PRD template](../assets/PRD_template.md)
2. **Study quality standards** from [PRD example](../assets/PRD_example.md)
3. **Create comprehensive checklist** mapping all template sections
4. **Update session state** with template analysis complete

### Phase 1: Information Gathering

**Objective**: Collect all information needed to complete PRD sections.

1. **Request existing documentation** - gather all available project materials:

   - Market research reports, user interviews and surveys
   - Technical specifications or architecture docs
   - Business plans or strategy documents
   - Competitive analysis, previous PRDs or project documents
   - User personas or journey maps, wireframes or design mockups

2. **Analyze provided documents** - map what information is already available

   - Map which checklist items are covered by documentation
   - Mark completed items in checklist
   - Identify gaps requiring additional information

3. **Iterative questioning with hypothesis** - for each missing checklist item:
   - **Ask ONE specific question at a time** with plausible hypothesis
   - **Always propose reasonable assumption** based on available context
   - **Wait for developer response** (confirmation, correction, elaboration)
   - **Update checklist** and move to next missing item

**Example Questions with Hypothesis:**

- _"Based on documentation, I assume the primary problem is [specific pain point hypothesis]. Is this accurate?"_
- _"Given the project context, the primary user persona would be [demographic/role hypothesis] who needs [specific need hypothesis]. Correct?"_
- _"The must-have MVP features would likely include [3-4 feature hypotheses]. Are these the right priorities?"_

### Phase 2: PRD Creation

**Objective**: Create comprehensive PRD using gathered information.

1. **Create PRD file** at [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
2. **Use template structure** from [PRD template](../assets/PRD_template.md)
3. **Match quality standards** from [PRD example](../assets/PRD_example.md)
4. **Apply writing guidelines** per [documentation standards](../guidelines/README.md)

### Phase 3: Review & Approval

**Objective**: Refine PRD through developer feedback until approved.

1. **Present complete draft** for comprehensive review with this approach:

   - Present complete draft from target file for initial review
   - Request specific feedback on each section
   - Ask for priority on feedback items (critical vs. nice-to-have changes)

2. **Review Request Template:**
   _"I've completed the first draft of your PRD. Please review each section and provide feedback on:_

   - _Accuracy of information_
   - _Missing details or requirements_
   - _Clarity and specificity_
   - _Alignment with your vision_

   _Please prioritize feedback as critical (must fix) or enhancement (nice to have)."_

3. **Iterate until approved**:
   - Update PRD file directly based on feedback
   - Present updated sections for re-review
   - Repeat until developer approval

## Quality Standards

### PRD Creation Guidelines

**Follow template structure exactly** - use [PRD template](../assets/PRD_template.md):

- Copy template into [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
- Replace all placeholders with gathered information
- Match quality standard from [PRD example](../assets/PRD_example.md)
- Use clear, actionable language with specific details and measurable criteria

**Writing Quality Requirements:**

- Follow writing style and detail level from example
- Use specific numbers, dates, and metrics
- Structure user stories and acceptance criteria exactly as shown
- Make technical requirements implementable and clear
- Ensure success metrics are measurable and time-bound

### Best Practices for AI Assistants

**Do's:**

- Always start with documentation analysis to minimize questions
- Ask one question at a time to avoid overwhelming developer
- Be specific in questions and provide context
- Update checklist after each response
- Validate understanding by summarizing complex responses
- Focus on actionable language in PRD
- Include measurable criteria wherever possible

**Don'ts:**

- Never assume information not explicitly provided
- Don't ask multiple questions at once
- Don't move to next topic until current one is complete
- Don't include vague requirements in PRD
- Don't skip documentation analysis step
- Don't finalize without developer approval

### Final Approval Checklist

**Content Quality:**

- [ ] Success metrics are measurable and time-bound with exact targets
- [ ] Technical requirements are implementable and clearly articulated
- [ ] User stories include clear acceptance criteria following example format
- [ ] Risks have corresponding mitigation strategies with specific actions

**Structure Quality:**

- [ ] All sections from template are completed
- [ ] Information flows logically between sections
- [ ] Terminology is consistent throughout
- [ ] Writing tone and style matches example standard

**Completeness:**

- [ ] All checklist items derived from template are addressed
- [ ] No assumptions made without validation
- [ ] All stakeholder needs considered
- [ ] Document provides sufficient detail for development team
- [ ] Final document saved in [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)

---

## References

**Primary Templates & Examples:**

- [PRD Template](../assets/PRD_template.md) - Complete structure and sections
- [PRD Example](../assets/PRD_example.md) - Quality standards and writing style

**Implementation Guidelines:**

- [Documentation Standards](../guidelines/README.md) - Writing and formatting guidelines
- [Collaboration Guidelines](../guidelines/collaboration/README.md) - Question asking and review processes
- [User Story Template](../guidelines/collaboration/templates/user-story-template.md) - User story format standards

**Target Output:**

- [Final PRD Location](../../adoption/product/PRD.md) - Where completed PRD is saved and maintained

## Next Steps

After PRD approval, proceed with project setup and strategic planning:

**Project Foundation (Critical First):**

- **Complete Bootstrap Checklist** → [02-how-to-complete-bootstrap-checklist.md](02-how-to-complete-bootstrap-checklist.md)

**Strategic Planning:**

- **Create & Prioritize Initiatives** → [03-how-to-create-and-prioritize-initiatives.md](03-how-to-create-and-prioritize-initiatives.md)
- **Define Project Subdomains** → [04-how-to-define-subdomains.md](04-how-to-define-subdomains.md)
- **Define Bounded Contexts** → [05-how-to-define-bounded-contexts.md](05-how-to-define-bounded-contexts.md)

**Development Preparation:**

- **Breakdown Epics** → [06-how-to-breakdown-epics.md](06-how-to-breakdown-epics.md)
- **Create User Stories** → [07-how-to-breakdown-user-stories.md](07-how-to-breakdown-user-stories.md)
