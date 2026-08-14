# How to Complete Bootstrap Checklist - AI-Assisted Guide

## Overview

Transform PRD requirements into comprehensive technical standards through systematic checklist completion and collaborative document generation.

**Role**: Senior Technical Architect (Bootstrap and Standards Creation)
**Process**: AI proposes and drafts, Developer validates and approves
**Skills**: `/pair-process-bootstrap` (operational details), `/pair-capability-setup-pm` (PM tool configuration), `/pair-capability-map-subdomains` + `/pair-capability-map-contexts` (full-catalog domain modeling — capabilities, composed by `/pair-process-bootstrap` with `$scope: all`, the only caller allowed that scope)

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

See `/pair-process-bootstrap` Phase 0 and Phase 1 for operational details.

### Phase 1: Checklist Completion

Systematically gather information for all technical decisions.

1. **Architecture** — scale, integrations, compliance, patterns
2. **Tech Stack** — languages, frameworks, libraries with versions
3. **Infrastructure** — deployment, CI/CD, monitoring
4. **UX/UI** — design system, accessibility, device support
5. **Way of Working** — processes, quality gates, release cycles

**HALT** — do NOT generate documents with incomplete information.

See `/pair-process-bootstrap` Phase 2 for section-specific questions and assessment flow.

### Phase 2: Standards Generation

Generate five adoption documents, one at a time with review cycles.

**Document order**: architecture → tech-stack → infrastructure → ux-ui → way-of-working

For each document:

1. Present key decisions with rationale
2. Show complete document for review
3. Iterate on feedback
4. Get approval before saving to [`.pair/adoption/tech/`](../../adoption/tech/)

See `/pair-process-bootstrap` Phase 3 for generation procedures and quality gate setup.

### Phase 2.5: Domain Modeling (optional, full-catalog)

Runs once architecture.md and tech-stack.md are adopted — both are prerequisites for bounded context placement.

1. Compose `/pair-capability-map-subdomains` with `$scope: all` — classifies business capabilities from the PRD into Core/Supporting/Generic subdomains with a Volatility rating. Falls back to "system areas" if no initiatives exist yet.
2. Compose `/pair-capability-map-contexts` with `$scope: all` — derives bounded context boundaries from the subdomain catalog, architecture, and tech stack; assesses per-relationship integration strength/distance/volatility.
3. Both capabilities degrade gracefully if not installed — domain modeling never blocks bootstrap completion.

This is the **only** point where either capability runs a full-catalog `$scope: all` mapping — every other caller (`/pair-process-plan-initiatives`, `/pair-process-plan-epics`, `/pair-process-plan-tasks`, `/pair-process-refine-story`) invokes them scoped to what it just touched. See [Callers Matrix](../skills-guide.md#callers-matrix-scoped-capabilities).

See `/pair-process-bootstrap` Phase 3.5 for operational details.

### Phase 2.6: Classification Delta (optional, opt-in)

Runs after domain modeling, so the criticality rows are **proposed from** the subdomains and bounded contexts just mapped instead of asked from nothing.

1. Offer the `## Criticality Table` and `## Overrides` sections of `tech/risk-matrix.md` — the two classification-delta sections nothing else authors (`/pair-capability-classify` self-proposes `## Tag Projection` only).
2. Confirmed sections are written with the same propose-then-write-if-confirmed registry pattern `/pair-capability-classify` uses for its own section — registry state, so not via `/pair-capability-record-decision`.
3. Strictly opt-in: the file is optional by design, so declining writes nothing and classification resolves from KB defaults. Never blocks bootstrap completion.

See `/pair-process-bootstrap` Phase 3.6 for the question set and the write path.

### Phase 3: Finalization

1. Verify consistency across all standards documents
2. Configure PM tool via `/pair-capability-setup-pm`
3. Establish update process for future iterations
4. Get developer final approval

See `/pair-process-bootstrap` Phase 4 for verification and PM configuration flow.

## Final Quality Checklist

- [ ] Project categorization confirmed and documented
- [ ] All adoption standards documents generated and approved
- [ ] Documents stored in [`.pair/adoption/tech/`](../../adoption/tech/)
- [ ] Internal consistency verified across all documents
- [ ] Quality gates configured and executable
- [ ] Domain model bootstrapped via `/pair-capability-map-subdomains` + `/pair-capability-map-contexts` (full-catalog), or explicitly skipped
- [ ] PM tool configured via `/pair-capability-setup-pm`

## References

- [Bootstrap Checklist](../assets/bootstrap-checklist.md) — project setup framework
- [Adopted Standards format](../../adoption/tech/README.md) — document format requirements
- [Guidelines](../guidelines/README.md) — architecture, technical standards, infrastructure, UX, collaboration

## Next Steps

- **Create and Prioritize Initiatives** → [03-how-to-create-and-prioritize-initiatives.md](03-how-to-create-and-prioritize-initiatives.md) — subdomain placement happens inline via `/pair-capability-map-subdomains`, scoped to each initiative
