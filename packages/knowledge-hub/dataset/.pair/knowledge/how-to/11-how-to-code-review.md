# How to Code Review - AI-Assisted Guide

## Overview

Validate implemented code quality and ensure compliance with technical standards through systematic code review following pull request creation.

**Role**: Product Software Engineer (Code Review)
**Process**: AI reviews comprehensively, Developer validates and decides
**Skill**: When `/review` is available, invoke it — it automates the operational steps of this workflow (quality gates, adoption compliance, DoD checking, review report). This how-to describes the workflow and its HALT conditions.

**CRITICAL FIRST STEP**: Before any review work begins, complete Phase 0: PR & Context Analysis to fully understand what needs to be validated.

## Session State Management

**CRITICAL**: Maintain this context throughout code review:

```text
CODE REVIEW STATE:
├── PR: [#PR-NUMBER: PR Title]
├── Status: [pending | changes-requested | approved]
├── Story: [STORY-ID: Story Title]
├── Review Type: [feature | bug | refactor | docs | config]
├── ADR Validation: [required: X | documented: Y | missing: Z]
├── Issues Found: [critical: X | major: Y | minor: Z]
├── Report Generated: [Yes/No using code-review-template.md]
└── Next Action: [specific next step]
```

## Core Principles

### PR-First Review with ADR Enforcement

- **Review ONLY completed PRs** — validate existing pull request with implemented changes
- **CRITICAL ADR validation** — verify all new technical decisions are properly documented
- **Follow code review template** per [code-review-template.md](../guidelines/collaboration/templates/code-review-template.md)
- **Validate story requirements** from the user story being implemented
- **Apply technical standards** from [adoption guidelines](../../adoption/tech) and [quality standards](../guidelines/quality-assurance/quality-standards/README.md)

**HALT CONDITION — Missing ADR**: If new libraries/patterns found without ADR documentation:

1. HALT merge process immediately
2. Request ADR creation following [ADR template](../guidelines/architecture/decision-frameworks/adr-process.md)
3. Update adoption documents to include new decisions
4. Do NOT proceed until technical decisions are properly documented

### Technical Alignment

- **Architecture**: Follow [adopted architecture](../../adoption/tech/architecture.md)
- **Technology Stack**: Use ONLY libraries from [tech-stack.md](../../adoption/tech/tech-stack.md)
- **Code Quality**: Apply [code design guidelines](../guidelines/code-design/README.md)
- **Testing**: Follow [testing strategy](../guidelines/testing/test-strategy/README.md)
- **Security**: Validate [security guidelines](../guidelines/quality-assurance/security/README.md)

## Prerequisites & HALT Conditions

### Critical Blockers (HALT if not met)

- **Active PR Required**: Pull request must exist and be ready for review
- **PM Tool Configured**: Must exist in [way-of-working.md](../../adoption/tech/way-of-working.md)
- **Story Context Available**: User story must be accessible and understood
- **PR Analysis Complete**: Phase 0 must be completed before any other work

### Access Requirements

Follow [project management tool guidelines](../guidelines/collaboration/project-management-tool/README.md) for tool-specific access based on the configured tool in [way-of-working.md](../../adoption/tech/way-of-working.md).

## Review Flow

### Phase 0: PR & Context Analysis (BLOCKING PREREQUISITE)

**HALT ALL WORK** if this phase is not successfully completed.

1. **Set PR status** to "pending" in GitHub
2. **Load PR** from PM tool — details, changes, metadata, files changed
3. **Load story context** — acceptance criteria, task completion claims, business context
4. **Classify review type** — feature, bug, refactor, docs, or config
5. **Confirm with developer** before proceeding

### Phase 1: Technical Standards Validation

1. **Quality gates** — run linter, type checker, tests per [quality standards](../guidelines/quality-assurance/quality-standards/README.md)
2. **Code quality assessment** — readability, maintainability, naming per [code design guidelines](../guidelines/code-design/README.md)
3. **ADR & adoption compliance** — scan for new technical decisions (libraries, patterns, technologies). **Missing ADR → HALT** (see Core Principles)

### Phase 2: Story & Requirements Validation

1. **Acceptance criteria** — verify all story AC are satisfied
2. **Task completion** — confirm all tasks delivered as claimed
3. **Business value** — implementation delivers expected value
4. **Testing coverage** — adequate per [testing strategy](../guidelines/testing/test-strategy/README.md)

### Phase 3: Review Report & Decision

1. **Generate review report** using [code-review-template.md](../guidelines/collaboration/templates/code-review-template.md)
2. **Post report as PR comment** with all findings by severity
3. **Set PR status** based on findings:

#### Review Decisions:

| Decision              | Condition                                               | Next Step                                                                |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| **APPROVED**          | All requirements met, quality gates pass                | Squash merge, mark story "Done"                                          |
| **CHANGES REQUESTED** | Critical issues, missing ADR, failing tests, AC not met | Return to [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md) |
| **TECH DEBT**         | Only minor issues, tracked as debt                      | Approve PR, create debt items                                            |

### Phase 4: Completion & Integration

#### For Approved Reviews Only:

1. **Squash merge** per [commit template](../guidelines/collaboration/templates/commit-template.md)
2. **Update story status** to "Done" in PM tool
3. **Clean up branch** — delete feature branch
4. **Update epic progress**

## Success Criteria

#### Review Complete When:

- [ ] Phase 0 completed — PR and story context loaded
- [ ] ADR and adoption compliance validated for all new technical decisions
- [ ] All technical standards verified against adoption guidelines
- [ ] Review report generated using [code-review-template.md](../guidelines/collaboration/templates/code-review-template.md)
- [ ] Report posted as PR comment
- [ ] PR status updated (pending/changes-requested/approved)
- [ ] Review decision made

#### For Approved Reviews:

- [ ] Squash merge completed
- [ ] Story marked "Done" in PM tool
- [ ] Branch cleanup completed

## References

### Templates

- [Code Review Template](../guidelines/collaboration/templates/code-review-template.md) — review structure and format
- [ADR Template](../guidelines/architecture/decision-frameworks/adr-process.md) — ADR format for technical decisions
- [Commit Template](../guidelines/collaboration/templates/commit-template.md) — squash commit format

### Adoption & Standards

- [Tech Stack](../../adoption/tech/tech-stack.md) — approved libraries and versions
- [Architecture](../../adoption/tech/architecture.md) — system architecture patterns
- [Way of Working](../../adoption/tech/way-of-working.md) — development process

### Guidelines

- [Code Design](../guidelines/code-design/README.md) — code design principles
- [Testing Strategy](../guidelines/testing/test-strategy/README.md) — testing standards
- [Quality Standards](../guidelines/quality-assurance/quality-standards/README.md) — quality gates
- [Security Guidelines](../guidelines/quality-assurance/security/README.md) — security validation

### Related Workflows

- [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md) — follow-up task implementation
- [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md) — story refinement
- [09-how-to-create-tasks.md](09-how-to-create-tasks.md) — task creation for findings

## Next Steps

**For Approved Reviews**: → Merge completion and story closure
**For Changes Requested**: → [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md)
**For Tech Debt Creation**: → Story creation and backlog management
