# Code Review Management Template

## Table of Contents

- [Overview](#overview)
- [Code Review Report Template](#code-review-report-template)
- [Implementation Options & Support](#implementation-options--support)
  - [Implementation Options](#implementation-options)
  - [Implementation Support Framework](#implementation-support-framework)
- [Integration with Project Management Tools](#integration-with-project-management-tools)
  - [Filesystem-Based Review Management](#filesystem-based-review-management)

## Code Review Report Template

```markdown
# Code Review Report: [STORY_ID] - [STORY_NAME]

## Review Summary

**Branch:** [BRANCH_NAME]
**Review Date:** [DATE]
**Reviewer:** AI Assistant + [DEVELOPER_NAME]
**Implementation Status:** [COMPLETE/PARTIAL/REQUIRES_FOLLOW_UP]

### Metrics Overview

| Metric            | Target | Actual | Status  |
| ----------------- | ------ | ------ | ------- |
| Story Completion  | 100%   | [X]%   | [✅/❌] |
| Task Completion   | 100%   | [X]%   | [✅/❌] |
| Test Coverage     | [X]%   | [Y]%   | [✅/❌] |
| Quality Standards | 100%   | [X]%   | [✅/❌] |

## Story Validation Results

### Acceptance Criteria Assessment

[AC-1]: [Description] - **Status:** [✅/❌/⚠️]

- **Implementation:** [Location and description]
- **Test Coverage:** [Test files and coverage]
- **Quality Assessment:** [Quality evaluation]

### Task Completion Analysis

[TASK-1]: [Description] - **Status:** [✅/❌/⚠️]

- **Specification Compliance:** [Assessment]
- **Quality Assessment:** [Quality evaluation]
- **Integration Status:** [Integration assessment]

## Technical Standards Compliance

### Architecture Review Results

- **Pattern Compliance:** [Assessment against architectural patterns]
- **Bounded Context Respect:** [Assessment of context boundary adherence]
- **Design Decision Consistency:** [Assessment against established ADRs]

### Technology Standards Assessment

- **Framework Usage:** [Assessment of framework compliance]
- **Library Dependencies:** [Assessment of approved library usage]
- **Version Consistency:** [Assessment of version alignment across workspaces]

### Infrastructure Compliance

- **Deployment Patterns:** [Assessment against deployment requirements]
- **Configuration Management:** [Assessment of configuration handling]
- **Monitoring Integration:** [Assessment of observability implementation]

## Quality Assurance Results

### Definition of Done Compliance

- **Code Quality:** [Assessment against quality standards]
- **Testing Coverage:** [Assessment of test coverage and quality]
- **Documentation:** [Assessment of documentation completeness]
- **Security:** [Assessment against security guidelines]
- **Performance:** [Assessment against performance requirements]
- **Accessibility:** [Assessment of accessibility compliance]

## Issues and Recommendations

### Critical Issues

[List critical issues with specific solutions]

### Major Issues

[List major issues with specific solutions]

### Minor Issues

[List minor issues with specific solutions]

### Suggestions

[List improvement suggestions and enhancement opportunities]

## Follow-up Actions

### Created Tasks

[List of tasks created for addressing review findings]

### Adoption Updates

[List of adoption document updates made or recommended]

### Implementation Plan

[Specific plan for addressing confirmed issues and improvements]

## Review Completion

**Final Status:** [APPROVED/APPROVED_WITH_CONDITIONS/REQUIRES_REWORK]
**Next Phase:** [Integration/Additional_Implementation/Re-review]
**Developer Sign-off:** [Pending/Completed]
```

---

## Implementation Options & Support

### Implementation Options

- **Option A: Immediate Implementation**
  - Proceed immediately with implementing tasks following established TDD methodology
  - Complete implementation process including test-driven development, quality validation, and progress tracking
- **Option B: Task Queue Addition**
  - Add tasks to current sprint or next sprint queue for prioritized implementation
  - Consider team capacity and sprint planning constraints
- **Option C: Developer Implementation**
  - Enable independent implementation using established implementation guides
  - Provide review and validation support as needed

### Implementation Support Framework

- **Direct Implementation**: Guide through complete TDD implementation process
- **Implementation Support**: Provide guidance and validation during developer implementation
- **Queue Management**: Update sprint planning and task prioritization
- **Progress Tracking**: Monitor implementation progress and provide status updates

## Integration with Project Management Tools

### Filesystem-Based Review Management

- Add review follow-up tasks to existing user story files
- Update user story status to reflect additional review work
- Maintain traceability through task references within story documentation
- Add review follow-up tasks to existing user story files
