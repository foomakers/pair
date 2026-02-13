# How to Complete Bootstrap Checklist - AI-Assisted Guide

## Overview

Transform PRD requirements into comprehensive technical standards through systematic checklist completion and collaborative document generation.

**Role**: Senior Technical Architect (Bootstrap and Standards Creation)
**Process**: AI proposes and drafts, Developer validates and approves
**Skills**: `/bootstrap` (operational details), `/setup-pm` (PM tool configuration)

## Session State Management

**CRITICAL**: Maintain this context throughout bootstrap completion:

```text
BOOTSTRAP COMPLETION STATE:
├── Project: [Project Name from PRD]
├── Bootstrap Status: [analysis | categorization | checklist | standards | approved]
├── Project Type: [Type A/B/C or pending]
├── Checklist Progress: [X/Y sections complete]
├── Standards Generated: [X/5 documents complete]
├── Target Location: [.pair/adoption/tech/]
└── Next Action: [specific next step]
```

## Project Categorization Framework

| Type | Profile | Team | Scale | Compliance |
|------|---------|------|-------|------------|
| **A** (Pet/PoC) | Minimal budget, fast iteration | 1-3 people | Single user or small group | None |
| **B** (Startup/Scale-up) | Moderate budget, rapid growth | 3-15 people | Scaling users | Some integrations |
| **C** (Enterprise) | Significant budget, stability | 15+ people | Many users, high availability | Full compliance |

## Phase Flow

### Phase 0: Foundation Analysis

**HALT if PRD not analyzed** — must understand business context first.
**HALT if project type unclear** — categorization drives all technical decisions.

1. Read PRD from [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
2. Extract: target users, budget, timeline, team size, compliance, integrations
3. Evaluate project type indicators against categorization framework

See `/bootstrap` Phase 0 and Phase 1 for operational details.

### Phase 1: Checklist Completion

Systematically gather information for all technical decisions.

1. **Architecture** — scale, integrations, compliance, patterns
2. **Tech Stack** — languages, frameworks, libraries with versions
3. **Infrastructure** — deployment, CI/CD, monitoring
4. **UX/UI** — design system, accessibility, device support
5. **Way of Working** — processes, quality gates, release cycles

**HALT** — do NOT generate documents with incomplete information.

See `/bootstrap` Phase 2 for section-specific questions and assessment flow.

### Phase 2: Standards Generation

Generate five adoption documents, one at a time with review cycles.

**Document order**: architecture → tech-stack → infrastructure → ux-ui → way-of-working

For each document:

1. Present key decisions with rationale
2. Show complete document for review
3. Iterate on feedback
4. Get approval before saving to [`.pair/adoption/tech/`](../../adoption/tech/)

See `/bootstrap` Phase 3 for generation procedures and quality gate setup.

### Phase 3: Finalization

1. Verify consistency across all standards documents
2. Configure PM tool via `/setup-pm`
3. Establish update process for future iterations
4. Get developer final approval

See `/bootstrap` Phase 4 for verification and PM configuration flow.

## Final Quality Checklist

- [ ] Project categorization confirmed and documented
- [ ] All adoption standards documents generated and approved
- [ ] Documents stored in [`.pair/adoption/tech/`](../../adoption/tech/)
- [ ] Internal consistency verified across all documents
- [ ] Quality gates configured and executable
- [ ] PM tool configured via `/setup-pm`

## References

- [Bootstrap Checklist](../assets/bootstrap-checklist.md) — project setup framework
- [Adopted Standards format](../../adoption/tech/README.md) — document format requirements
- [Guidelines](../guidelines/README.md) — architecture, technical standards, infrastructure, UX, collaboration

## Next Steps

- **Create and Prioritize Initiatives** → [03-how-to-create-and-prioritize-initiatives.md](03-how-to-create-and-prioritize-initiatives.md)
- **Define Project Subdomains** → [04-how-to-define-subdomains.md](04-how-to-define-subdomains.md)
- **Define Bounded Contexts** → [05-how-to-define-bounded-contexts.md](05-how-to-define-bounded-contexts.md)
