# User Story Template

<!-- word-limits: Initial Breakdown Template=600; Refined User Story Template=1600; Story Statement=40; Epic Context=40; User Value=60; Rough Sizing=40; Initial Scope=90; Definition of Done Expectations=70; Dependencies=30; Notes=40; Classification=80; Acceptance Criteria=250; Definition of Done Checklist=120; Story Sizing and Sprint Readiness=100; Dependencies and Coordination=70; Validation and Testing Strategy=60; Notes and Additional Context=60; Technical Analysis=140 -->

## 📋 Table of Contents

- [Initial Breakdown Template](#initial-breakdown-template)
- [Refined User Story Template](#refined-user-story-template)

## Initial Breakdown Template

```markdown
## Story Statement

**As a** [user persona]
**I want** [capability]
**So that** [business value or user benefit]

## Epic Context

**Parent Epic**: [Epic Name and Link]
**Status**: [Todo | Refined | In Progress | Done]
**Priority**: [P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)]

### Status Workflow

- **Todo**: created, not yet refined
- **Refined**: detailed, estimated, ready for development
- **In Progress**: being developed
- **Done**: delivered and accepted

## User Value

**User Benefit**: [High-level benefit for users]
**Business Impact**: [Contribution to epic and business objectives]
**Visible UI Value**: [UI element, screen, interaction or feedback demonstrable in sprint review]

## Rough Sizing

**Story Points**: [XS(1), S(2), M(3), L(5), XL(8)]
**Confidence**: [High | Medium | Low]
**Reasoning**: [Brief justification — uncertainty is expected]

## Initial Scope

### Likely In Scope

- [Expected functionality, interaction patterns, core capabilities]
- [UI components and interactions that make value visible]

### Likely Out of Scope

- [Excluded functionality, future stories, related but separate capabilities]

### Open Questions

- [Uncertainties, implementation details to decide, requirements to clarify]

## Definition of Done Expectations

**Standard DoD Requirements** (detailed during refinement):

- [ ] Functionality implemented and working
- [ ] **UI demonstrates the user value** (screen, interaction, feedback, data display)
- [ ] Automated tests written and passing
- [ ] Code reviewed and merged
- [ ] Documentation updated
- [ ] **Demo-ready for sprint review** (clear user story value visible in UI)

## Dependencies

**Story Dependencies**: [Stories this likely depends on]
**Epic Dependencies**: [Epic-level dependencies]

## Notes

[Context, assumptions, planning considerations — uncertainty is expected]
```

## Refined User Story Template

> **Section ordering**: functional sections first, technical last. Technical Analysis is the bridge to Task Breakdown (appended by `/pair-process-plan-tasks`).

<!-- -->

> **Definition of Ready**: each of the 6 canonical DoR criteria maps to one section below — see [definition-of-ready-and-done.md](../project-management-tool/definition-of-ready-and-done.md) for the mapping table and the fallback when a board has no Ready state.

```markdown
## Story Statement

**As a** [specific user persona from PRD]
**I want** [detailed functionality and user interaction]
**So that** [specific business value and user benefit]

**Where**: [Application/interface where the user experiences the value]

## Epic Context

**Parent Epic**: [Epic Name and Link]
**Status**: [Refined | In Progress | Done]
**Priority**: [P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)] (confirmed during refinement)

### Status Workflow

- **Refined**: detailed, estimated, ready for development
- **In Progress**: being developed
- **Done**: delivered and accepted

## Classification

> Risk/cost matrix compiled by `/classify` in **refinement** context, written as **1 line + `<details>`** (D22 reading budget), never an inline table. Review re-runs `/classify`: it may **confirm or raise** a dimension, **never lower** it (the refinement tier is a floor, G6/D17). Leave the placeholder until `/classify` populates it; when `/classify` is not installed the section stays empty and refinement notes the skip.

`risk:[green | yellow | red]` · `cost:[green | yellow | orange | red]` [· coupling: not assessed — no domain artifacts]

<details>
<summary>Matrix — per dimension</summary>

| Dimension                  | Tier                  | Source                                       | Note |
| -------------------------- | --------------------- | -------------------------------------------- | ---- |
| Service/domain criticality | [g/y/r]               | [Criticality Table \| KB default]            |      |
| Change/diff risk           | [g/y/r]               | [story scope]                                |      |
| Business impact            | [g/y/r]               | [subdomain class \| Overrides: business-impact.trivial-diff] |      |
| Security relevance         | [g/y/r]               | [path heuristic]                             |      |
| Coupling balance           | [g/y/r \| not assessed] | [subdomain volatility + integrations \| absent] |      |

</details>

## Acceptance Criteria

### Functional Requirements

**Given-When-Then Format:**

1. **Given** [initial condition or context]
   **When** [user action or trigger]
   **Then** [expected system response and user outcome]

2. **Given** [different context]
   **When** [user action]
   **Then** [expected outcome]

[Continue for all functional scenarios]

### Business Rules

- [Business rule with measurable criteria; data validation; permission and access control; integration with existing rules]

### Edge Cases and Error Handling

- **Invalid Input**: [handling and response]
- **System Errors**: [conditions and user feedback]
- **Boundary Conditions**: [limits and constraints]
- **Exceptional Scenarios**: [unusual but valid use cases]

## Definition of Done Checklist

### Development Completion

- [ ] All acceptance criteria implemented and verified
- [ ] Code follows project standards and conventions
- [ ] Code review completed and approved by a team member
- [ ] Unit tests written and passing (minimum coverage: [X]% - project standard)
- [ ] Integration tests for external interfaces and API endpoints
- [ ] Documentation updated (API docs, user guides, technical documentation)
- [ ] Security scan completed, vulnerabilities addressed
- [ ] Performance benchmarks met and verified through testing

### Quality Assurance

- [ ] All acceptance criteria tested against specifications
- [ ] Edge cases and error conditions tested comprehensively
- [ ] Cross-browser/platform testing completed (supported browsers/devices)
- [ ] Performance criteria verified (response times, throughput, resource usage)
- [ ] Security requirements validated through testing and review
- [ ] Accessibility compliance verified (WCAG level)
- [ ] User experience validated (usability testing if applicable)
- [ ] Regression testing completed for existing functionality

### Deployment and Release

- [ ] Deployed to staging successfully
- [ ] Staging validation completed by product owner
- [ ] Production deployment checklist completed
- [ ] Feature flags configured (if applicable)
- [ ] Monitoring and alerting configured for new functionality
- [ ] Database migrations tested and validated (if applicable)
- [ ] User documentation and help content updated and reviewed
- [ ] Rollback plan prepared and tested
- [ ] Post-deployment verification completed

## Story Sizing and Sprint Readiness

### Refined Story Points

**Final Story Points**: [X points from detailed analysis]
**Confidence Level**: [High | Medium | Low]
**Sizing Justification**: [Reasoning from technical analysis]

### Sprint Capacity Validation

**Sprint Fit Assessment**: [Fits in a single sprint?]
**Development Time Estimate**: [X days]
**Testing Time Estimate**: [Y days]
**Total Effort Assessment**: [Fits within sprint capacity: Yes/No]

### Story Splitting Recommendations

**If story exceeds sprint capacity:**
**Recommended Split:**

1. **Story [Code]-A**: [Core functionality subset]
   - **Acceptance Criteria**: [Essential criteria subset]
   - **Size Estimate**: [Reduced points]
2. **Story [Code]-B**: [Additional functionality]
   - **Acceptance Criteria**: [Extended criteria]
   - **Dependencies**: [Depends on Story A]
   - **Size Estimate**: [Remaining points]
     **Split Rationale**: [Why the split keeps user value and enables incremental delivery]

## Dependencies and Coordination

### Story Dependencies

**Prerequisite Stories**: [Must be completed first]
**Dependent Stories**: [Depend on this story]
**Shared Components**: [Common elements with other stories]

### Team Coordination

**Development Roles Involved**:

- **Frontend**: [Work and coordination]
- **Backend**: [API and data layer responsibilities]
- **QA**: [Testing strategy and coordination]
- **UX/UI**: [Design review and validation]

### External Dependencies

**Third-party Integrations**: [External services or APIs]
**Infrastructure Requirements**: [Deployment or environment needs]
**Compliance Requirements**: [Legal, security or regulatory coordination]

## Validation and Testing Strategy

### Acceptance Testing Approach

**Testing Methods**: [How acceptance criteria are validated]
**Test Data Requirements**: [Data needed]
**Environment Requirements**: [Test environment]

### User Validation

**User Feedback Collection**: [How to gather it]
**Success Metrics**: [Measurable outcomes]
**Rollback Plan**: [If the story misses expectations]

## Notes and Additional Context

**Refinement Session Insights**: [Key decisions and considerations]
**Team Concerns**: [Concerns raised]
**Future Considerations**: [Items for later]
**Documentation Links**: [Technical specs or design documents]

## Technical Analysis

### Implementation Approach

**Technical Strategy**: [High-level approach]
**Key Components**: [Major components involved]
**Data Flow**: [How data moves through the system]
**Integration Points**: [External systems or APIs]
**Design**: [not required | required — reference: link/path to the design doc]

### Technical Requirements

- [Technical constraints; performance criteria and benchmarks; security; accessibility and usability standards]

### Technical Risks and Mitigation

| Risk               | Impact | Probability | Mitigation Strategy        |
| ------------------ | ------ | ----------- | -------------------------- |
| [Technical risk]   | High   | Medium      | [Specific mitigation plan] |
| [Integration risk] | Medium | Low         | [Risk reduction approach]  |

### Spike Requirements

**Required Spikes**: [Research or proof-of-concept work needed]

- [Spike 1]: [Research question and acceptance criteria]
- [Spike 2]: [Technical investigation scope]
  **Estimated Spike Effort**: [Time for investigation]

---

**Refinement Completed By**: [Team member names and roles]
**Refinement Date**: [Date of refinement completion]
**Review and Approval**: [Product owner approval confirmation]
```
