# User Story Template

## 📋 Table of Contents

- [Initial Breakdown Template](#initial-breakdown-template)
- [Refined User Story Template](#refined-user-story-template)

## Initial Breakdown Template

```markdown
## Story Statement

**As a** [user persona]
**I want** [general functionality or capability]
**So that** [business value or user benefit]

## Epic Context

**Parent Epic**: [Epic Name and Link]
**Status**: [Todo | Refined | In Progress | Done]
**Priority**: [P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)]

### Status Workflow

- **Todo**: Story is created but not yet refined
- **Refined**: Story is detailed, estimated, and ready for development
- **In Progress**: Story is actively being developed
- **Done**: Story delivered and accepted

## User Value

**User Benefit**: [High-level benefit this story delivers to users]
**Business Impact**: [How this story contributes to epic and business objectives]
**Visible UI Value**: [Specific UI element, screen, interaction, or feedback that will be demonstrable in sprint review]

## Rough Sizing

**Story Points**: [Initial size estimate: XS(1), S(2), M(3), L(5), XL(8)]
**Confidence**: [High | Medium | Low]
**Reasoning**: [Brief justification for sizing - uncertainty is expected]

## Initial Scope

### Likely In Scope

- [General functionality expected to be included]
- [High-level user interaction patterns]
- [Core system capabilities]
- [UI components and interactions that make value visible]

### Likely Out of Scope

- [Functionality probably excluded]
- [Future story considerations]
- [Related but separate capabilities]

### Open Questions

- [Uncertainties to be resolved during refinement]
- [Implementation details to be decided]
- [Requirements to be clarified]

## Definition of Done Expectations

**Standard DoD Requirements** (to be detailed during refinement):

- [ ] Functionality implemented and working
- [ ] **UI demonstrates the user value** (screen, interaction, feedback, data display)
- [ ] Automated tests written and passing
- [ ] Code reviewed and merged
- [ ] Documentation updated
- [ ] **Demo-ready for sprint review** (clear user story value visible in UI)

## Dependencies

**Story Dependencies**: [Other user stories this likely depends on]
**Epic Dependencies**: [Epic-level dependencies affecting this story]

## Notes

[Brief additional context, assumptions, or planning considerations - uncertainty is expected and normal]
```

## Refined User Story Template

```markdown
## Story Statement

**As a** [specific user persona from PRD]
**I want** [detailed functionality and user interaction]
**So that** [specific business value and user benefit]

**Where**: [Specific application/interface where user experiences the value]

## Epic Context

**Parent Epic**: [Epic Name and Link]
**Status**: [Refined | In Progress | Done]
**Priority**: [P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)] (confirmed during refinement)

### Status Workflow

- **Refined**: Story is detailed, estimated, and ready for development
- **In Progress**: Story is actively being developed
- **Done**: Story delivered and accepted

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

- [Specific business rule with measurable criteria]
- [Data validation requirements]
- [User permission and access control rules]
- [Integration with existing system rules]

### Edge Cases and Error Handling

- **Invalid Input**: [How system handles and responds]
- **System Errors**: [Error conditions and user feedback]
- **Boundary Conditions**: [Limits and constraint handling]
- **Exceptional Scenarios**: [Unusual but valid use cases]

## Technical Analysis

### Implementation Approach

**Technical Strategy**: [High-level implementation approach]
**Key Components**: [Major technical components involved]
**Data Flow**: [How data moves through the system]
**Integration Points**: [External systems or APIs involved]

### Technical Requirements

- [Specific technical constraint or requirement]
- [Performance criteria and benchmarks]
- [Security considerations and requirements]
- [Accessibility and usability standards]

### Technical Risks and Mitigation

| Risk               | Impact | Probability | Mitigation Strategy        |
| ------------------ | ------ | ----------- | -------------------------- |
| [Technical risk]   | High   | Medium      | [Specific mitigation plan] |
| [Integration risk] | Medium | Low         | [Risk reduction approach]  |

### Spike Requirements

**Required Spikes**: [Research or proof-of-concept work needed]

- [Spike 1]: [Research question and acceptance criteria]
- [Spike 2]: [Technical investigation scope]
  **Estimated Spike Effort**: [Time needed for technical investigation]

## Definition of Done Checklist

### Development Completion

- [ ] All acceptance criteria implemented and verified
- [ ] Code follows project coding standards and conventions
- [ ] Code review completed and approved by team member
- [ ] Unit tests written and passing (minimum coverage: [X]% - specify project standard)
- [ ] Integration tests implemented for external interfaces and API endpoints
- [ ] Documentation updated (API docs, user guides, technical documentation)
- [ ] Security scan completed and vulnerabilities addressed
- [ ] Performance benchmarks met and verified through testing

### Quality Assurance

- [ ] All acceptance criteria tested and verified against specifications
- [ ] Edge cases and error conditions tested comprehensively
- [ ] Cross-browser/platform testing completed (specify supported browsers/devices)
- [ ] Performance criteria met and verified (response times, throughput, resource usage)
- [ ] Security requirements validated through testing and review
- [ ] Accessibility standards compliance verified (specify WCAG level)
- [ ] User experience validation completed (usability testing if applicable)
- [ ] Regression testing completed for existing functionality

### Deployment and Release

- [ ] Feature deployed to staging environment successfully
- [ ] Staging validation completed by product owner
- [ ] Production deployment checklist completed
- [ ] Feature flags configured appropriately (if applicable)
- [ ] Monitoring and alerting configured for new functionality
- [ ] Database migrations tested and validated (if applicable)
- [ ] User documentation and help content updated and reviewed
- [ ] Rollback plan prepared and tested
- [ ] Post-deployment verification completed

## Story Sizing and Sprint Readiness

### Refined Story Points

**Final Story Points**: [X points based on detailed analysis]
**Confidence Level**: [High | Medium | Low]
**Sizing Justification**: [Detailed reasoning based on technical analysis]

### Sprint Capacity Validation

**Sprint Fit Assessment**: [Does story fit in single sprint?]
**Development Time Estimate**: [X days based on technical analysis]
**Testing Time Estimate**: [Y days for comprehensive validation]
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
     **Split Rationale**: [Why this split maintains user value and enables incremental delivery]

## Dependencies and Coordination

### Story Dependencies

**Prerequisite Stories**: [Stories that must be completed first]
**Dependent Stories**: [Stories that depend on this story]
**Shared Components**: [Common elements with other stories]

### Team Coordination

**Development Roles Involved**:

- **Frontend**: [Specific frontend work and coordination]
- **Backend**: [API and data layer responsibilities]
- **QA**: [Testing strategy and coordination needs]
- **UX/UI**: [Design review and validation requirements]

### External Dependencies

**Third-party Integrations**: [External services or APIs]
**Infrastructure Requirements**: [Deployment or environment needs]
**Compliance Requirements**: [Legal, security, or regulatory coordination]

## Validation and Testing Strategy

### Acceptance Testing Approach

**Testing Methods**: [How acceptance criteria will be validated]
**Test Data Requirements**: [Specific data needed for testing]
**Environment Requirements**: [Testing environment specifications]

### User Validation

**User Feedback Collection**: [How to gather user validation]
**Success Metrics**: [Measurable outcomes for story success]
**Rollback Plan**: [What to do if story doesn't meet expectations]

## Notes and Additional Context

**Refinement Session Insights**: [Key decisions and considerations from refinement discussion]
**Team Concerns**: [Any concerns raised during refinement]
**Future Considerations**: [Items noted for future development]
**Documentation Links**: [References to detailed technical specs or design documents]

---

**Refinement Completed By**: [Team member names and roles]
**Refinement Date**: [Date of refinement completion]
**Review and Approval**: [Product owner approval confirmation]
```
