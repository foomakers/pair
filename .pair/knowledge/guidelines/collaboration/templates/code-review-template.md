# Code Review Template

## Review Information

**PR Number:** [#XXX]  
**Author:** [Developer name]  
**Reviewer:** [Your name]  
**Review Date:** [YYYY-MM-DD]  
**Story/Epic:** [US-XXX or EP-XXX]  
**Review Type:** [Feature/Bug Fix/Refactor/Hotfix]  
**Estimated Review Time:** [XX minutes]

## Review Summary

### Overall Assessment

- [ ] **Approved** - Ready to merge
- [ ] **Approved with Comments** - Minor issues noted, can merge
- [ ] **Request Changes** - Issues must be addressed before merge
- [ ] **Comment Only** - Feedback provided, no blocking issues

### Key Changes Summary

[Brief summary of what was reviewed and the main changes]

### Business Value Validation

[Confirm the changes deliver the expected business value]

## Code Review Checklist

### Functionality Review

- [ ] **Requirements Met** - Implementation matches acceptance criteria
- [ ] **Business Logic** - Logic is correct and handles edge cases
- [ ] **User Experience** - Changes improve or maintain user experience
- [ ] **Integration** - Works correctly with existing systems
- [ ] **Error Handling** - Appropriate error handling and recovery
- [ ] **Performance** - No performance regressions introduced

### Code Quality Assessment

- [ ] **Readability** - Code is clear and easy to understand
- [ ] **Maintainability** - Code is organized and well-structured
- [ ] **Reusability** - Common functionality properly abstracted
- [ ] **Naming** - Variables, functions, and classes well-named
- [ ] **Comments** - Appropriate documentation and comments
- [ ] **Complexity** - Code complexity is reasonable and justified

### Technical Standards Compliance

- [ ] **Style Guide** - Follows established coding standards
- [ ] **Architecture** - Aligns with system architecture principles
- [ ] **Design Patterns** - Uses appropriate design patterns
- [ ] **Dependencies** - Dependencies are justified and minimal
- [ ] **API Design** - API changes are backward compatible
- [ ] **Database** - Database changes are optimized and indexed

## Security Review

### Security Checklist

- [ ] **Input Validation** - All user inputs properly validated
- [ ] **Output Encoding** - Data properly encoded for output
- [ ] **Authentication** - Authentication mechanisms properly implemented
- [ ] **Authorization** - Access controls correctly enforced
- [ ] **Data Protection** - Sensitive data properly handled
- [ ] **Dependency Security** - No known security vulnerabilities
- [ ] **Secrets Management** - No hardcoded secrets or credentials
- [ ] **HTTPS/TLS** - Secure communication protocols used

### Security Concerns

| Concern   | Severity        | Description   | Recommendation |
| --------- | --------------- | ------------- | -------------- |
| [Issue 1] | High/Medium/Low | [Description] | [How to fix]   |
| [Issue 2] | High/Medium/Low | [Description] | [How to fix]   |

## Testing Review

### Test Coverage Assessment

- [ ] **Unit Tests** - Adequate unit test coverage (target: 80%+)
- [ ] **Integration Tests** - Integration scenarios covered
- [ ] **End-to-End Tests** - Critical user journeys tested
- [ ] **Edge Cases** - Boundary conditions and edge cases tested
- [ ] **Error Scenarios** - Error conditions and recovery tested
- [ ] **Performance Tests** - Performance requirements validated

### Test Quality Review

- [ ] **Test Clarity** - Tests are clear and well-named
- [ ] **Test Independence** - Tests don't depend on each other
- [ ] **Test Data** - Test data is appropriate and realistic
- [ ] **Mocking** - External dependencies properly mocked
- [ ] **Assertions** - Assertions are specific and meaningful
- [ ] **Test Organization** - Tests are well-organized and grouped

### Testing Feedback

```
Current Coverage: XX%
New Coverage: XX%
Coverage Change: +/-XX%

Test Results: ✅ All Passing / ❌ X Failing
Performance Tests: ✅ Within Limits / ⚠️ Degradation Detected
```

## Performance Review

### Performance Analysis

- [ ] **Response Time** - API response times within acceptable limits
- [ ] **Memory Usage** - Memory consumption is reasonable
- [ ] **Database Performance** - Database queries are optimized
- [ ] **Caching** - Appropriate caching strategies implemented
- [ ] **Resource Usage** - CPU and I/O usage is efficient
- [ ] **Scalability** - Changes support system scalability

### Performance Metrics

| Metric           | Before | After | Change | Acceptable |
| ---------------- | ------ | ----- | ------ | ---------- |
| Response Time    | XXXms  | XXXms | +/-XX% | ✅/❌        |
| Memory Usage     | XXXMb  | XXXMb | +/-XX% | ✅/❌        |
| Database Queries | XX     | XX    | +/-XX  | ✅/❌        |

## Documentation Review

### Documentation Checklist

- [ ] **Code Comments** - Complex logic appropriately commented
- [ ] **API Documentation** - API changes documented
- [ ] **README Updates** - README reflects new functionality
- [ ] **User Documentation** - User-facing documentation updated
- [ ] **Technical Documentation** - Architecture/design docs updated
- [ ] **Change Log** - Changes documented in CHANGELOG

### Documentation Quality

- [ ] **Accuracy** - Documentation matches implementation
- [ ] **Completeness** - All new features documented
- [ ] **Clarity** - Documentation is clear and understandable
- [ ] **Examples** - Appropriate examples provided
- [ ] **Up-to-date** - Existing documentation updated

## Detailed Review Comments

### Positive Feedback

**What's Done Well:**

- [Specific positive observations about code quality, approach, or implementation]
- [Recognition of good practices, clever solutions, or improvements]
- [Appreciation for thorough testing or documentation]

### Issues to Address

#### Critical Issues ⚠️

**Must fix before merge:**

- [ ] **[File:Line]** - [Critical issue description and impact]
- [ ] **[File:Line]** - [Another critical issue requiring resolution]

#### Major Issues 🔍

**Should fix before merge:**

- [ ] **[File:Line]** - [Major issue description and suggested solution]
- [ ] **[File:Line]** - [Another major issue with improvement recommendation]

#### Minor Issues 💡

**Consider addressing:**

- [ ] **[File:Line]** - [Minor improvement suggestion]
- [ ] **[File:Line]** - [Code style or best practice recommendation]

#### Questions ❓

**Clarification needed:**

- [ ] **[File:Line]** - [Question about implementation approach or decision]
- [ ] **[File:Line]** - [Request for explanation of complex logic]

## Suggestions and Improvements

### Code Improvements

```diff
// Current implementation
- if (user != null && user.isActive() == true) {
+ if (user?.isActive()) {
    // Process user
}
```

### Architecture Suggestions

- [Suggestion for better design pattern or architectural approach]
- [Recommendation for improved separation of concerns]
- [Advice on better abstraction or interface design]

### Best Practices

- [Recommendation for following established team practices]
- [Suggestion for improved error handling patterns]
- [Advice on better testing strategies]

## Risk Assessment

### Technical Risks

| Risk               | Impact       | Probability  | Mitigation            |
| ------------------ | ------------ | ------------ | --------------------- |
| [Technical risk]   | High/Med/Low | High/Med/Low | [Mitigation strategy] |
| [Integration risk] | High/Med/Low | High/Med/Low | [Risk reduction plan] |

### Business Risks

| Risk            | Impact       | Probability  | Mitigation             |
| --------------- | ------------ | ------------ | ---------------------- |
| [Business risk] | High/Med/Low | High/Med/Low | [Business mitigation]  |
| [User impact]   | High/Med/Low | High/Med/Low | [User experience plan] |

## Deployment Considerations

### Deployment Checklist

- [ ] **Database Migration** - Migration scripts reviewed and tested
- [ ] **Configuration** - Environment configuration reviewed
- [ ] **Feature Flags** - Feature toggles properly configured
- [ ] **Rollback Plan** - Rollback procedure defined and tested
- [ ] **Monitoring** - Appropriate monitoring and alerting in place
- [ ] **Documentation** - Deployment documentation updated

### Post-Deployment Monitoring

- [ ] **Error Rates** - Monitor error rate changes
- [ ] **Performance Metrics** - Track performance indicators
- [ ] **User Behavior** - Monitor user interaction patterns
- [ ] **System Health** - Overall system health monitoring

## Follow-up Actions

### Author Action Items

- [ ] **[Priority]** - [Action item for the author to complete]
- [ ] **[Priority]** - [Another action item with deadline if applicable]
- [ ] **[Priority]** - [Follow-up task or improvement]

### Reviewer Follow-up

- [ ] **Re-review** - Schedule re-review after changes
- [ ] **Pair Programming** - Offer pairing session for complex issues
- [ ] **Knowledge Sharing** - Share relevant resources or documentation

### Team Actions

- [ ] **Process Improvement** - Identify process improvements from this review
- [ ] **Standards Update** - Update coding standards based on findings
- [ ] **Training Need** - Identify training opportunities for team

## Review Timeline

### Review Process

- **Review Started:** [YYYY-MM-DD HH:MM]
- **Initial Review Completed:** [YYYY-MM-DD HH:MM]
- **Changes Requested:** [YYYY-MM-DD HH:MM]
- **Changes Made:** [YYYY-MM-DD HH:MM]
- **Final Approval:** [YYYY-MM-DD HH:MM]

### Review Effort

- **Time Spent Reviewing:** [XX hours]
- **Complexity Level:** [Low/Medium/High]
- **Review Thoroughness:** [Quick/Standard/Deep]

---

## Review Templates for Different Types

### Feature Review Template

```markdown
## Feature Review: [Feature Name]

**User Story:** [US-XXX]
**Business Value:** [Expected value delivery]

### Functionality Validation

- [ ] Feature matches acceptance criteria
- [ ] User experience is intuitive
- [ ] Edge cases handled appropriately

### Implementation Quality

- [ ] Code is clean and maintainable
- [ ] Architecture aligns with system design
- [ ] Performance meets requirements
```

### Bug Fix Review Template

```markdown
## Bug Fix Review: [Bug Description]

**Bug ID:** [BUG-XXX]
**Severity:** [Critical/High/Medium/Low]
**Root Cause:** [Identified cause]

### Fix Validation

- [ ] Root cause properly addressed
- [ ] Fix doesn't introduce new issues
- [ ] Regression test added

### Quality Assurance

- [ ] Minimal changes made
- [ ] All related scenarios tested
- [ ] Documentation updated if needed
```

### Refactoring Review Template

```markdown
## Refactoring Review: [Code Area]

**Objective:** [Refactoring goal]
**Scope:** [What's being refactored]

### Refactoring Quality

- [ ] Code readability improved
- [ ] Performance maintained or improved
- [ ] Functionality unchanged
- [ ] Test coverage maintained

### Risk Assessment

- [ ] No breaking changes introduced
- [ ] Backward compatibility maintained
- [ ] Deployment risk minimized
```

### Hotfix Review Template

```markdown
## HOTFIX Review: [Critical Issue]

**Severity:** CRITICAL
**Issue:** [Production problem]
**Impact:** [Business/user impact]

### Emergency Review Focus

- [ ] Fix addresses immediate problem
- [ ] Minimal change approach used
- [ ] Risk of new issues minimized
- [ ] Rollback plan ready

### Expedited Process

- [ ] Priority reviewer assigned
- [ ] Fast-track approval process
- [ ] Emergency deployment prepared
```

## Review Quality Standards

### Effective Review Practices

1. **Be Constructive** - Focus on code, not the person
2. **Be Specific** - Provide clear, actionable feedback
3. **Be Timely** - Complete reviews within agreed timeframes
4. **Be Thorough** - Cover all aspects systematically
5. **Be Educational** - Share knowledge and best practices

### Review Communication Guidelines

- **Use positive language** - Frame feedback constructively
- **Explain the why** - Provide reasoning for suggestions
- **Offer solutions** - Don't just identify problems
- **Ask questions** - Seek understanding before criticizing
- **Acknowledge good work** - Recognize quality implementations

This code review template ensures thorough, consistent, and constructive code reviews that maintain high code quality standards while supporting team learning and collaboration.
