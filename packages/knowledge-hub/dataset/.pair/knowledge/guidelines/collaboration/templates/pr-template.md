# Pull Request Template

<!-- word-limits: PR Information=60; Summary=120; Changes Made=150; Services to Release=60; Testing=100; Screenshots=20; Quality Assurance=60; Deployment Information=80; Breaking Changes=80; Documentation=60; Performance Impact=80; Security Considerations=80; Accessibility=60; Risk Assessment=100; Reviewer Guide=120; Dependencies & Related Work=80; Stakeholder Communication=80 ; Pre-Submission Checklist=80 -->

## PR Information

> Conditional — the closing `Refs:` line is included ONLY when the code host differs from the PM tool (`way-of-working.md` → `## Git Workflow` → `code-host`); omit it on a single-tool project (the host links PR and item natively). It is the PR → item half of the text-convention cross-link: `/publish-pr` writes it verbatim from the story id; `/review` Step 1.2 and `/next`'s open-PR row read it back. Keep the token PLAIN — nothing before it on the line, no bold, **no trailing markdown hard-break spaces** — in its own paragraph, so the anchored read-back (`^Refs:[ \t]*(.+?)[ \t]*$`) captures the item id and nothing else.

**PR Title:** [US-XXX] [type]: [brief description]  
**Story/Epic:** [Link]  
**Type:** [Feature/Bug Fix/Refactor/Chore/Documentation/Hotfix]  
**Priority:** [High/Medium/Low]  
**Assignee:** [Developer name]  
**Reviewers:** [@reviewer1, @reviewer2]  
**Labels:** [feature, bug-fix, documentation, etc.]  

Refs: [PM-tool item id — renders as `Refs: ENG-412`]

## Summary

### What Changed

[What was implemented, fixed or changed]

### Why This Change

[Business value, problem solved or improvement delivered]

### Story Context

**User Story:** [Story statement]  
**Acceptance Criteria:** [Criteria addressed]

## Changes Made

### Implementation Details

- [ ] **Change 1:** [Implementation detail]
- [ ] **Change 2:** [Key implementation aspect]
- [ ] **Change 3:** [Change made]
- [ ] **Change 4:** [Further detail]

### Files Changed

- **Modified:** [Key files]
- **Added:** [New files]
- **Deleted:** [Removed files]
- **Renamed:** [Renamed files]

### Database Changes

- [ ] **Schema Changes:** […]
- [ ] **Migration Scripts:** [Data migration needs]
- [ ] **Data Changes:** [Updates or transformations]
- [ ] **Performance Impact:** […]

### API Changes

- [ ] **New Endpoints:** […]
- [ ] **Modified Endpoints:** […]
- [ ] **Breaking Changes:** […]
- [ ] **Documentation:** [API docs updates]

## Services to Release

> Conditional — include ONLY when the branch touches **deployable** packages/services, derived from `git diff --name-only <base-branch>...HEAD` grouped by owning package (`packages/*`, `apps/*`); exclude content/docs-only packages (e.g. `packages/knowledge-hub`, `apps/website` content). Omit the whole section when nothing deployable changed.

- **[package/service name]:** [what changed, release-relevant summary]

## Testing

### Test Coverage

- [ ] **Unit Tests:** [New tests, coverage %]
- [ ] **Integration Tests:** […]
- [ ] **End-to-End Tests:** [E2E scenarios]
- [ ] **Manual Testing:** [Completed checks]

### Test Results

```text
Test Suite: ✅ Passing
Coverage: XX% (target: 80%+)
Performance Tests: ✅ Passing
Security Scan: ✅ No issues
Linting: ✅ Clean
```

### Testing Strategy

- **Happy Path:** [Main journey]
- **Edge Cases:** [Boundaries]
- **Error Handling:** [Error scenarios, recovery]
- **Performance:** [Results]

## Screenshots

> Conditional — include ONLY when the diff touches UI (project UI package globs, else a path heuristic); before/after. Omit for non-UI changes; if UI changed but no capture is available, keep the section with a `TODO: attach before/after` marker.

| Before | After |
| ------ | ----- |
| [before screenshot] | [after screenshot] |

## Quality Assurance

### Code Quality Checklist

- [ ] Style guides and conventions followed
- [ ] Functions and classes documented
- [ ] Error handling for edge cases
- [ ] Security best practices followed
- [ ] Performance considerations addressed
- [ ] No debugging code or console logs left

### Review Areas

- [ ] **Business Logic:** implementation matches requirements
- [ ] **Code Structure:** maintainability and readability
- [ ] **Error Handling:** robust handling and recovery
- [ ] **Performance:** performance implications
- [ ] **Security:** vulnerabilities
- [ ] **Testing:** coverage and quality

## Deployment Information

### Environment Impact

- [ ] **Development:** Ready for development environment
- [ ] **Staging:** Tested in staging environment
- [ ] **Production:** Ready for production deployment
- [ ] **Configuration:** Environment-specific configuration updated

### Deployment Notes

- **Database Migration:** [Steps]
- **Configuration Changes:** [Environment variables]
- **Feature Flags:** [Configuration]
- **Dependencies:** [New or updated]

### Rollback Plan

[Steps to roll back if issues appear post-deployment]

## Breaking Changes

### API Breaking Changes

- [ ] **Endpoint Changes:** [Modified or removed]
- [ ] **Request/Response Format:** [Data structure changes]
- [ ] **Authentication:** [Authentication or authorization changes]

### Integration Breaking Changes

- [ ] **Third-party Services:** [External integrations affected]
- [ ] **Internal Services:** [Internal systems affected]
- [ ] **Client Applications:** [Frontend or mobile apps affected]

### Migration Guide

[How to update dependent systems or client code]

## Documentation

### Documentation Updates

- [ ] **README:** […]
- [ ] **API Documentation:** […]
- [ ] **User Documentation:** […]
- [ ] **Technical Documentation:** [Architecture or technical docs]

### Knowledge Sharing

- [ ] **Technical Decisions:** [Documented decisions]
- [ ] **Learning Notes:** [Lessons or new knowledge]
- [ ] **Best Practices:** [New patterns or practices]

## Performance Impact

### Performance Metrics

- **Load Time:** […]
- **Response Time:** [API changes]
- **Memory Usage:** [Footprint changes]
- **Database Performance:** [Query impact]

### Benchmarking Results

```text
Before: [Baseline metrics]
After:  [Metrics after changes]
Impact: [Improvement/degradation %]
```

### Monitoring

- [ ] **Metrics Added:** […]
- [ ] **Alerts Configured:** […]
- [ ] **Dashboards Updated:** […]

## Security Considerations

### Security Review

- [ ] **Authentication:** [Mechanisms reviewed]
- [ ] **Authorization:** [Access control]
- [ ] **Data Protection:** [Sensitive data handling]
- [ ] **Input Validation:** [User input validated]
- [ ] **Dependency Security:** [Dependencies scanned]

### Security Testing

- [ ] **Security Scan:** [Automated scan completed]
- [ ] **Penetration Testing:** [Manual testing if required]
- [ ] **Compliance Check:** [Regulatory compliance]

## Accessibility

### Accessibility Compliance

- [ ] **WCAG 2.1 AA:** [Standards compliance]
- [ ] **Screen Reader:** [Compatibility tested]
- [ ] **Keyboard Navigation:** [Verified]
- [ ] **Color Contrast:** [Requirements met]

### Accessibility Testing

- [ ] **Automated Testing:** [Tools used]
- [ ] **Manual Testing:** [Manual verification]
- [ ] **User Testing:** [With accessibility users, if applicable]

## Risk Assessment

### Technical Risks

| Risk               | Impact       | Probability  | Mitigation            |
| ------------------ | ------------ | ------------ | --------------------- |
| [Technical risk 1] | High/Med/Low | High/Med/Low | [Mitigation strategy] |
| [Integration risk] | High/Med/Low | High/Med/Low | [Risk reduction plan] |

### Business Risks

| Risk               | Impact       | Probability  | Mitigation             |
| ------------------ | ------------ | ------------ | ---------------------- |
| [Business risk 1]  | High/Med/Low | High/Med/Low | [Business mitigation]  |
| [User impact risk] | High/Med/Low | High/Med/Low | [User experience plan] |

## Reviewer Guide

### Review Focus Areas

1. **Business Logic Validation:** implementation matches acceptance criteria; edge cases and error scenarios; user experience flows
2. **Code Quality Assessment:** structure and organization; reusability and maintainability; naming conventions and documentation
3. **Technical Implementation:** architectural decisions; performance implications; security considerations

### Testing the Changes

```bash
[Commands to test this PR locally: checkout, install, test, run]
```

### Key Test Scenarios

1. **Scenario 1:** [Step-by-step instructions]
2. **Scenario 2:** [Another scenario]
3. **Scenario 3:** [Edge case]

## Dependencies & Related Work

### Blocking Dependencies

- [ ] **PR Dependency:** [PRs that must merge first]
- [ ] **Infrastructure:** [Changes required]
- [ ] **Third-party:** [External service updates needed]

### Related PRs

- **Follows:** [PRs this builds upon]
- **Blocks:** [PRs waiting for this]
- **Related:** [Related or parallel work]

### Follow-up Work

- [ ] **Technical Debt:** [Created or addressed]
- [ ] **Future Enhancements:** [Planned]
- [ ] **Monitoring:** [Ongoing needs]

## Stakeholder Communication

### Stakeholder Notification

- [ ] **Product Owner:** [Approval needed]
- [ ] **Business Stakeholders:** [Communication]
- [ ] **Customer Support:** [Notification]
- [ ] **Operations Team:** [Awareness needed]

### Communication Plan

- **Before Merge:** [Pre-deployment communication]
- **After Deployment:** [Post-deployment communication]
- **Issue Response:** [Handling deployment issues]

---

Type emphasis: Feature → user impact + technical decisions; Bug Fix → problem, root cause, solution, verification; Refactoring → motivation + no functional changes; Documentation → audience + coverage; Hotfix → immediate problem, minimal fix, rollback plan.

## Pre-Submission Checklist

### Before Creating PR

- [ ] All acceptance criteria implemented and tested
- [ ] Team standards and style guides followed
- [ ] All tests passing (unit, integration, E2E)
- [ ] Documentation updated where necessary
- [ ] Security considerations reviewed
- [ ] Performance impact assessed
- [ ] Breaking changes documented

### PR Description Complete

- [ ] Summary of changes and business value
- [ ] Testing strategy and results documented
- [ ] Deployment considerations noted
- [ ] Review areas highlighted
- [ ] Related work and dependencies linked

### Ready for Review

- [ ] Appropriate reviewers assigned
- [ ] Labels and metadata added
- [ ] CI/CD pipeline passing
- [ ] No merge conflicts with target branch
- [ ] PR size appropriate for effective review
