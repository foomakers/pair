# How to Create a Product Requirements Document (PRD) - AI-Assisted Guide

## Overview

Transform product ideas into comprehensive Product Requirements Documents through collaborative analysis and structured information gathering.

**Role**: Product Manager (PRD Creation)
**Process**: AI gathers and drafts, Developer validates and approves
**Skill**: `/pair-process-specify-prd` — see skill for operational details (question templates, checklist, writing procedures)

## Session State Management

**CRITICAL**: Maintain this context throughout PRD creation:

```text
PRD CREATION STATE:
├── Product: [Product/Feature Name]
├── PRD Status: [template-analysis | info-gathering | drafting | review | approved]
├── Template: [reviewed: Yes/No]
├── Info Checklist: [completed: X/Y sections]
├── Target File: [.pair/adoption/product/PRD.md]
└── Next Action: [specific next step]
```

## Phase Flow

### Phase 0: Template and Reference Analysis

**HALT if template not reviewed** — must understand structure first.
**HALT if example not analyzed** — must understand quality expectations.

1. Analyze [PRD template](../assets/PRD_template.md) structure
2. Study quality standards from [PRD example](../assets/PRD_example.md)
3. Create section-by-section checklist from template

See `/pair-process-specify-prd` Phase 1 for operational details.

### Phase 1: Information Gathering

Collect all information needed to complete PRD sections.

1. Request and analyze existing documentation
2. Map which checklist sections are covered
3. For each gap: ask ONE question at a time with hypothesis
4. Wait for developer response before proceeding

**HALT** — do NOT proceed to drafting until all sections have information.

See `/pair-process-specify-prd` Phase 2 for question templates and hypothesis patterns.

### Phase 2: PRD Creation

Create comprehensive PRD using gathered information.

1. Create PRD at [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
2. Follow [PRD template](../assets/PRD_template.md) structure exactly
3. Match quality standard from [PRD example](../assets/PRD_example.md)

See `/pair-process-specify-prd` Phase 3 for writing procedures and quality checks.

### Phase 3: Review and Approval

Refine PRD through developer feedback until approved.

1. Present complete draft for review
2. Request feedback: accuracy, completeness, clarity, alignment
3. Iterate until developer explicitly approves

**HALT** — never finalize without developer approval.

See `/pair-process-specify-prd` Phase 4 for review workflow.

## Final Approval Checklist

- [ ] Success metrics are measurable and time-bound
- [ ] Technical requirements are implementable
- [ ] User stories include clear acceptance criteria
- [ ] Risks have mitigation strategies
- [ ] All template sections completed
- [ ] Document saved in [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)

---

## References

- [PRD Template](../assets/PRD_template.md) — structure and sections
- [PRD Example](../assets/PRD_example.md) — quality standards
- [Documentation Standards](../guidelines/README.md) — writing guidelines

## Next Steps

After PRD approval:

- **Complete Bootstrap Checklist** → [02-how-to-complete-bootstrap-checklist.md](02-how-to-complete-bootstrap-checklist.md)
- **Create and Prioritize Initiatives** → [03-how-to-create-and-prioritize-initiatives.md](03-how-to-create-and-prioritize-initiatives.md)
