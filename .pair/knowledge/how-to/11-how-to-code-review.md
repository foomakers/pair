# How to Code Review - AI-Assisted Guide

## Overview

Validate implemented code quality and ensure compliance with technical standards through systematic code review following pull request creation.

**Role**: Product Software Engineer (Code Review)
**Process**: 🤖🔍👨‍💻 (AI reviews comprehensively, Developer validates and decides)

**CRITICAL FIRST STEP**: Before any review work begins, complete Phase 0: PR & Context Analysis to fully understand what needs to be validated.

## Session State Management

**CRITICAL**: Maintain this context throughout code review:

```
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

### PR-First Review with ADR Validation

- **Review ONLY completed PRs** - validate existing pull request with implemented changes
- **CRITICAL ADR validation** - verify all new technical decisions are properly documented
- **Follow code review template** per [code-review-template.md](../guidelines/collaboration/templates/code-review-template.md)
- **Validate story requirements** from the user story being implemented
- **Apply technical standards** from [adoption guidelines](../../adoption/tech) and [quality standards](../guidelines/quality-assurance/quality-standards/README.md)

**CRITICAL**: If new libraries/patterns found without ADR documentation:

- **HALT merge process immediately**
- **Request ADR creation** following [ADR template](../guidelines/architecture/decision-frameworks/adr-process.md)
- **Update adoption documents** to include new decisions
- **Do NOT proceed** until technical decisions are properly documented

### Technical Alignment Requirements

- **Architecture**: Follow patterns from [architecture decisions](../../adoption/tech/architecture.md)
- **Technology Stack**: Use ONLY libraries from [tech-stack.md](../../adoption/tech/tech-stack.md)
- **Code Quality**: Apply [code design guidelines](../guidelines/code-design/README.md)
- **Testing**: Follow [testing strategy](../guidelines/testing/test-strategy/README.md)
- **Security**: Validate [security guidelines](../guidelines/quality-assurance/security/README.md)

## Prerequisites & Guardrails

### 🚫 Critical Blockers

- **Active PR Required**: Pull request must exist and be ready for review
- **PM Tool Configured**: Must exist in [way-of-working.md](../../adoption/tech/way-of-working.md)
- **Story Context Available**: User story must be accessible and understood
- **PR Analysis Complete**: Phase 0 must be completed before any other work

### 📋 Access Requirements

Follow [project management tool guidelines](../guidelines/collaboration/project-management-tool/README.md) for tool-specific access procedures based on the configured tool in [way-of-working.md](../../adoption/tech/way-of-working.md).

**Access Rules:**

- **✅ PERMITTED**: Filesystem access ONLY when tool = "filesystem" in way-of-working.md
- **🚫 PROHIBITED**: Filesystem access when any other tool is configured

**IMPORTANT**: Before proceeding to any review phases, **Phase 0: PR & Context Analysis** must be completed successfully. This includes loading the complete PR context and validating review readiness.

## Review Methodology

### Review Type Classification

Based on PR changes, determine validation approach:

**Development Reviews (TDD Validation):**

- **Feature Implementation** - New functionality validation
- **Bug Fix** - Defect correction with regression focus
- **Refactoring** - Code improvement with behavior preservation
- **Testing** - Test implementation and coverage validation

**Non-Development Reviews (Standards Validation):**

- **Documentation** - Content quality and standards compliance
- **Configuration** - Setup validation and best practices
- **Research** - Findings validation and recommendation quality

### ADR & Adoption Validation (CRITICAL)

**New Technical Decision Detection:**
Scan implementation for introduction of:

- **New Libraries/Dependencies** - Check package.json, requirements.txt, etc.
- **New Architectural Patterns** - Identify new design patterns or integrations
- **New Technologies** - Detect usage of new frameworks or tools
- **New Security Approaches** - Review authentication, authorization implementations
- **New Infrastructure Decisions** - Check deployment, monitoring configurations

**BLOCKING VALIDATION - IMMEDIATE REVIEW FAILURE:**
❌ **Undocumented New Library**: New dependency without ADR or adoption update
❌ **Unapproved Architecture Change**: New pattern without proper ADR documentation
❌ **Version Inconsistency**: New library versions inconsistent across workspaces
❌ **Missing Approval**: Technical decision made without stakeholder review

## Review Flow

### Phase 0: PR & Context Analysis (BLOCKING PREREQUISITE)

**🚫 CRITICAL: NO REVIEW WITHOUT COMPLETE PR & STORY UNDERSTANDING**

```
1. Set PR Status → Mark as "pending" review in GitHub
2. Load Active PR → PR details, changes, and metadata
3. Load Story Context → User story and acceptance criteria
4. Validate PR Readiness → All prerequisites met
5. Confirm Review Scope → Implementation boundaries understood
```

**PR Status Management:**

- **IMMEDIATELY set PR to "pending"** → Indicates review in progress
- **Use GitHub review system** → Leverage built-in PR review workflow
- **Update status based on findings** → pending → changes-requested/approved

**PR Loading Requirements:**

- **Load PR from configured PM tool** per [way-of-working.md](../../adoption/tech/way-of-working.md)
- **Understand implementation scope** and files changed
- **Verify PR status**: Must be open and ready for review
- **Extract story reference**: Link between PR and user story

**Story Validation Requirements:**

- **Read complete user story** linked to the PR
- **Understand acceptance criteria** implementation should satisfy
- **Validate task completion claims** in PR description
- **Confirm business context** and requirements

**BLOCKING VALIDATION:**
If ANY of these conditions are not met, **HALT ALL WORK**:

- [ ] PR not properly created or accessible
- [ ] Story context missing or unclear
- [ ] Implementation scope not understood
- [ ] Review prerequisites not met

**Developer Confirmation Required:**
_"I've loaded PR [#PR-NUMBER]: [TITLE] linked to Story [STORY-ID]. I understand the implementation scope and acceptance criteria. PR is ready for comprehensive code review. Proceeding with validation?"_

### Phase 1: Technical Standards Validation

```
1. ADR & Adoption Compliance → CRITICAL validation of technical decisions
2. Code Quality Assessment → Apply design guidelines
3. Architecture Compliance → Verify architectural patterns
4. Technology Standards → Validate tech stack usage
```

**🔍 CRITICAL: ADR & Adoption Validation**

**New Technical Decision Detection:**
Scan implementation for:

- **New Libraries/Dependencies** - Check package.json, requirements.txt, etc.
- **New Architectural Patterns** - Identify new design patterns or integrations
- **New Technologies** - Detect usage of new frameworks or tools
- **New Security Approaches** - Review authentication, authorization implementations
- **New Infrastructure Decisions** - Check deployment, monitoring configurations

**For Each New Technical Decision Found:**

- [ ] **ADR Exists** - Verify ADR document in [architecture.md](../../adoption/tech/architecture.md)
- [ ] **ADR Quality** - Contains context, options, and rationale
- [ ] **Adoption Updated** - [tech-stack.md](../../adoption/tech/tech-stack.md) includes new dependencies
- [ ] **Version Consistency** - Same versions across all workspaces
- [ ] **Guidelines Updated** - [Technical guidelines](../guidelines) reflect new approaches

**🚫 BLOCKING ISSUES - IMMEDIATE REVIEW FAILURE:**
❌ **Undocumented New Library** - New dependency without ADR or adoption update
❌ **Unapproved Architecture Change** - New pattern without proper ADR
❌ **Version Inconsistency** - Inconsistent library versions across workspaces

**Actions for Missing Documentation:**

1. **HALT merge process** - Set PR status to "changes-requested"
2. **Create ADR task** - Following [ADR template](../guidelines/architecture/decision-frameworks/adr-process.md)
3. **Update adoption documents** - Include new decisions in adoption files
4. **Re-review required** - After documentation completed

**Technical Standards Validation:**

- **Code Quality** - Apply [code design guidelines](../guidelines/code-design/README.md)
- **Architecture** - Follow [architecture decisions](../../adoption/tech/architecture.md)
- **Security** - Validate [security guidelines](../guidelines/quality-assurance/security/README.md)
- **Testing** - Verify [testing strategy](../guidelines/testing/test-strategy/README.md)

### Phase 2: Story & Requirements Validation

```
1. Acceptance Criteria Check → Verify all criteria satisfied
2. Task Completion Validation → Confirm all tasks delivered
3. Business Logic Review → Validate business requirements
4. User Experience Assessment → Check UX requirements
```

**Story Validation Requirements:**

- **Acceptance Criteria** - All criteria from story must be satisfied
- **Task Completion** - All related tasks marked as complete
- **Business Value** - Implementation delivers expected value
- **User Impact** - Changes improve or maintain user experience

**Quality Assurance:**

- **Testing Coverage** - Adequate test coverage per [testing strategy](../guidelines/testing/test-strategy/README.md)
- **Documentation** - Required documentation completed
- **Performance** - No performance regressions
- **Security** - Security requirements satisfied

### Phase 3: Review Report & Decision

```
1. Generate Review Report → Using code-review-template.md
2. Add Report to PR → Post comprehensive review as PR comment
3. Set PR Status → pending/changes-requested/approved based on findings
4. Developer Collaboration → Discuss findings and solutions
5. Final Decision → Approve, request changes, or create tech debt
```

**Review Report Generation (MANDATORY):**

- **Use template**: Follow [code-review-template.md](../guidelines/collaboration/templates/code-review-template.md) structure exactly
- **Generate comprehensive report**: Include all sections - summary, technical analysis, security, performance
- **Post as PR comment**: Add complete review report directly to GitHub PR comments
- **Include all findings**: Document critical, major, minor issues with specific solutions and code examples
- **Reference standards**: Link to specific guidelines and adoption documents for each finding

**PR Status Management (GitHub):**

- **Set to "pending"** → At start of review process
- **Set to "changes-requested"** → If critical issues found, BLOCK MERGE immediately
- **Set to "approved"** → If all requirements met, ready for merge

**Critical Issues that BLOCK Merge:**

- Undocumented new libraries or technical decisions (missing ADR)
- Security vulnerabilities or compliance violations
- Breaking changes without proper documentation
- Failed tests or quality gates
- Story acceptance criteria not satisfied

**Review Decisions:**

- **APPROVED ✅** → All requirements met, proceed with squash merge
- **CHANGES REQUESTED ❌** → Critical issues found, create tasks, return to [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md)
- **TECH DEBT CREATION 📋** → Minor issues tracked as tech debt, approve current PR

### Phase 4: Completion & Integration

```
1. Finalize PR Status → Set to "approved" in GitHub
2. Squash Commits → Prepare clean commit history
3. Final Commit Message → Use commit template format
4. Merge to Main → Complete integration
5. Status Updates → Update story and clean up branch
```

**For Approved Reviews Only:**

**Squash and Merge Process:**

- **Use GitHub squash merge** → Maintains clean history
- **Apply commit template format** per [commit template](../guidelines/collaboration/templates/commit-template.md):

```
[US-XXX] feat: story summary

Complete implementation including:
- Key features and changes
- Test coverage summary
- Technical decisions

Closes #T-XXX, #T-YYY
```

**Post-Merge Cleanup:**

- **Update story status** → Mark as "Done" in PM tool
- **Clean up branch** → Delete feature branch
- **Update epic progress** → Reflect completion

## Success Criteria

**Review Complete When:**

- [ ] PR status set to "pending" at start of review process
- [ ] PR context loaded with story/task validation
- [ ] ADR and adoption documentation validated for all new technical decisions
- [ ] All technical standards verified against adoption guidelines
- [ ] **Review report generated** using [code-review-template.md](../guidelines/collaboration/templates/code-review-template.md)
- [ ] **Report posted as PR comment** in GitHub with comprehensive findings
- [ ] PR status updated appropriately (pending/changes-requested/approved)
- [ ] Review decision made (approved/changes-requested/tech-debt)
- [ ] Follow-up actions documented and planned

**For Approved Reviews:**

- [ ] Squash merge completed successfully
- [ ] Story marked "Done" in PM tool
- [ ] Branch cleanup completed

## References

### Templates & Guidelines

- [Code Review Template](../guidelines/collaboration/templates/code-review-template.md) - Comprehensive review structure and format
- [ADR Template](../guidelines/architecture/decision-frameworks/adr-process.md) - Architecture Decision Record format for technical decisions
- [Task Template](../guidelines/collaboration/templates/task-template.md) - Task creation format for follow-up work
- [Branch Template](../guidelines/collaboration/templates/branch-template.md) - Branch naming standards validation
- [Commit Template](../guidelines/collaboration/templates/commit-template.md) - Squash commit format for merge

### Technical Standards

- [Tech Stack](../../adoption/tech/tech-stack.md) - Approved libraries and versions validation
- [Architecture Decisions](../../adoption/tech/architecture.md) - System architecture patterns compliance
- [Way of Working](../../adoption/tech/way-of-working.md) - Development process and PM tool configuration

### Quality Standards

- [Quality Standards](../guidelines/quality-assurance/quality-standards/README.md) - Quality gates and validation criteria
- [Code Design Guidelines](../guidelines/code-design/README.md) - Code quality and design principles
- [Testing Strategy](../guidelines/testing/test-strategy/README.md) - Testing coverage and quality requirements
- [Security Guidelines](../guidelines/quality-assurance/security/README.md) - Security validation requirements

### Process Guidelines

- [Project Management Framework](../guidelines/collaboration/project-management-tool/README.md) - PM tool usage and integration
- [Architecture Guidelines](../guidelines/architecture/README.md) - Architectural patterns and compliance
- [Infrastructure Guidelines](../guidelines/infrastructure/README.md) - Infrastructure and deployment standards
- [Performance Guidelines](../guidelines/quality-assurance/performance/README.md) - Performance standards and optimization

### Related Workflows

- [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md) - Follow-up task implementation process
- [08-how-to-refine-a-user-story.md](08-how-to-refine-a-user-story.md) - Story refinement for incomplete requirements
- [09-how-to-create-tasks.md](09-how-to-create-tasks.md) - Task creation for review findings

### Emergency Procedures

- **Missing ADR**: Create tasks for missing technical decision documentation
- **Technical Blockers**: Halt merge until documentation completed
- **Process Issues**: Escalate to developer for resolution

## Next Steps

**For Approved Reviews**: → Merge completion and story closure
**For Changes Requested**: → [10-how-to-implement-a-task.md](10-how-to-implement-a-task.md)
**For Tech Debt Creation**: → Story creation and backlog management
