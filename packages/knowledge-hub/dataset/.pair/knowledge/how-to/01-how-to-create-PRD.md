# How to Create a Product Requirements Document (PRD) - AI-Assisted Guide

## Overview

This guide enables developers and AI assistants to collaboratively create comprehensive Product Requirements Documents (PRDs) through a structured, iterative process. The PRD serves as the definitive blueprint for product development, ensuring alignment between stakeholders, clear feature specifications, and measurable success criteria.

**Key Benefits of a Well-Written PRD:**

- Eliminates ambiguity in product requirements
- Aligns development teams with business objectives
- Provides clear acceptance criteria for features
- Establishes measurable success metrics
- Reduces development rework and miscommunication

## AI-Assisted Workflow Principles

The collaborative process follows a **propose-and-validate** model:

- **AI Assistant Role**: Analyzes information, proposes content structure, asks targeted questions, drafts PRD sections
- **Developer Role**: Provides context, validates proposals, reviews content, approves final document
- **Shared Goal**: Create a comprehensive, actionable PRD that guides successful product development

## PRD Structure Reference

**AI Assistant Instructions:** You have access to the complete PRD template structure at [`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md) and a practical example at [`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md).

**Before starting the process, you must:**

1. **Review the template** ([`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md)) to understand all required sections and their purpose
2. **Study the example** ([`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md)) to understand the expected level of detail, writing style, and content quality
3. **Use these as your reference** throughout the entire process

The template provides the exact structure you must follow, while the example demonstrates the professional standard and specificity required for each section.

## Step-by-Step Implementation Process

### Step 1: Template Analysis and Checklist Creation

**AI Assistant Instructions:** Begin by analyzing the reference documents:

1. **Review [`./pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md)** to understand the complete structure and requirements
2. **Study [`./pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md)** to understand the expected quality, detail level, and writing style
3. **Create your information checklist** based on what you learn from these documents

Your checklist should map to every section and subsection in the template, ensuring you gather sufficient information to match the quality and specificity shown in the example.

**Key observations to extract from the example:**

- Level of specificity required (e.g., exact metrics, dates, user demographics)
- Professional writing tone and structure
- How technical requirements are articulated
- Quality of user stories and acceptance criteria
- Depth of analysis in problem statements and solution descriptions

### Step 2: Documentation Gathering

**AI Assistant Instructions:** Begin the process by requesting all available project documentation from the developer:

_"To create a comprehensive PRD, I need to analyze all available project documentation first. Please share any materials you have, including:_

- _Market research reports_
- _User interviews and surveys_
- _Technical specifications or architecture docs_
- _Business plans or strategy documents_
- _Competitive analysis_
- _Previous PRDs or project documents_
- _User personas or journey maps_
- _Wireframes or design mockups_
- _Any other relevant project materials_

_Please upload these documents or provide the information directly. This will help me understand the current context and minimize the questions I need to ask."_

### Step 3: Documentation Analysis

**AI Assistant Instructions:** After receiving documentation:

1. Thoroughly analyze all provided materials
2. Map which checklist items are already covered by the documentation
3. Mark completed items in your checklist
4. Identify gaps that require additional information from the developer
5. Prioritize remaining questions based on importance and dependencies

Present a summary to the developer:
_"Based on the documentation provided, I've identified the following information:_

- _[List items already covered]_
- _[List remaining gaps]_
  _I'll now ask targeted questions to gather the missing information."_

### Step 4: Iterative Information Gathering

**AI Assistant Instructions:** For each missing checklist item:

1. **Ask ONE specific, targeted question at a time**
2. **Always include a plausible hypothesis** based on available information and context
3. **Wait for the developer's response (confirmation, correction, or elaboration)**
4. **Update your checklist**
5. **Move to the next missing item**

**Question Guidelines with Hypothesis:**

- Be specific and actionable
- Provide context for why the information is needed
- **Always propose a reasonable assumption** based on documentation and previous answers
- Ask the developer to confirm, correct, or elaborate on your hypothesis
- Use the hypothesis to show you understand the project context

**Example Questions with Hypothesis:**

- _"Based on the documentation provided, I assume the primary problem this product solves is [specific pain point hypothesis]. Could you confirm if this is accurate or provide corrections?"_
- _"Given the project context, I believe the primary user persona would be [demographic and role hypothesis] who needs [specific need hypothesis]. Is this correct, or should I adjust this understanding?"_
- _"From what I understand so far, the must-have features for MVP would likely include [3-4 feature hypotheses]. Are these the right priorities, or would you modify this list?"_

### Step 5: PRD Drafting

**AI Assistant Instructions:** Once all checklist items are complete:

1. **Copy the template** from [`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md) into [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md)
2. **Replace all template placeholders** with the gathered information
3. **Match the quality standard** demonstrated in [`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md)
4. **Use clear, actionable language** similar to the example's professional tone
5. **Include specific details and measurable criteria** as shown in the example
6. **Reference provided documentation where appropriate**

**Quality Guidelines:**

- Follow the writing style and level of detail from the example
- Use specific numbers, dates, and metrics like the example does
- Structure user stories and acceptance criteria exactly as shown
- Ensure technical requirements follow the example's clarity and specificity
- Make success metrics measurable and time-bound as demonstrated

**Important:** The PRD must be created in [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md) and will contain all subsequent revisions as you iterate with the developer.

### Step 6: Review and Iteration Process

**AI Assistant Instructions:** Present the draft PRD to the developer with this approach:

1. **Present the complete draft** from [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md) for initial review
2. **Request specific feedback** on each section
3. **Ask for priority on feedback items** (critical vs. nice-to-have changes)
4. **Update the PRD file directly** based on feedback
5. **Present updated sections** for re-review
6. **Repeat until approved**

**Review Request Template:**
_"I've completed the first draft of your PRD in [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md). Please review each section and provide feedback on:_

- _Accuracy of information_
- _Missing details or requirements_
- _Clarity and specificity_
- _Alignment with your vision_

_Please prioritize your feedback as critical (must fix) or enhancement (nice to have). I'll update the document directly and present the changes for your review."_

### Step 7: Finalization

**AI Assistant Instructions:** Before final approval:

1. **Cross-reference with the template** from [`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md) to ensure no sections are missing
2. **Compare quality against the example** in [`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md) to ensure professional standards
3. **Verify all acceptance criteria are measurable** like those in the example
4. **Ensure consistency in terminology** throughout the document
5. **Confirm all stakeholders and timelines** are clearly identified
6. **Ensure the final version is saved** in [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md)

**Final Checklist:**

- [ ] All template sections completed per [`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md)
- [ ] Quality matches the standard of [`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md)
- [ ] Acceptance criteria are specific and measurable
- [ ] Technical requirements are implementable and clear
- [ ] Timeline is realistic and detailed with specific dates
- [ ] Risks are identified with concrete mitigation plans
- [ ] Success metrics are quantifiable with target values
- [ ] Document is saved in [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md)
- [ ] Document is ready for development team use

## Best Practices for AI Assistants

### Do's:

- **Always start with documentation analysis** to minimize questions
- **Ask one question at a time** to avoid overwhelming the developer
- **Be specific in questions** and provide context
- **Update your checklist** after each response
- **Validate understanding** by summarizing complex responses
- **Focus on actionable language** in the PRD
- **Include measurable criteria** wherever possible

### Don'ts:

- **Never assume information** not explicitly provided
- **Don't ask multiple questions at once**
- **Don't move to the next topic** until the current one is complete
- **Don't include vague requirements** in the PRD
- **Don't skip the documentation analysis step**
- **Don't finalize without developer approval**

## Quality Assurance Checklist

Before presenting the final PRD, ensure:

**Content Quality:**

- [ ] All information matches the specificity level of [`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md)
- [ ] Success metrics are measurable and time-bound with exact targets
- [ ] Technical requirements are implementable and clearly articulated
- [ ] User stories include clear acceptance criteria following the example format
- [ ] Risks have corresponding mitigation strategies with specific actions

**Structure Quality:**

- [ ] All sections from [`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md) are completed
- [ ] Information flows logically between sections
- [ ] Terminology is consistent throughout
- [ ] Document matches the professional formatting of the example
- [ ] Writing tone and style matches the example standard

**Completeness:**

- [ ] All checklist items derived from the template are addressed
- [ ] No assumptions are made without validation
- [ ] All stakeholder needs are considered
- [ ] Document provides sufficient detail for development team implementation
- [ ] Quality meets the professional standard demonstrated in the example
- [ ] Final document is properly saved in [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md)

This guide ensures a thorough, collaborative process that produces high-quality PRDs ready for successful product development implementation.

---

## References

- [`.pair/assets/PRD_template.md`](.pair/knowledge/assets/PRD_template.md) - Complete PRD template structure and sections
- [`.pair/assets/PRD_example.md`](.pair/knowledge/assets/PRD_example.md) - Example PRD demonstrating quality standards
- [`.pair/product/adopted/PRD.md`](.pair/adoption/product/PRD.md) - Target file where the final PRD will be created and maintained

**Additional Resources:**

- This guide serves as the primary instruction manual for the AI assistant
- All PRD iterations and revisions should be tracked in the target PRD file
- The AI assistant should reference the template and example throughout the entire process
