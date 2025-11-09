# Task Template

> **Note**: This template is used to document individual tasks within the Task Breakdown section of a User Story.
> Tasks are appended to the story body using this format.

## Task Information

**Task ID:** [T-XXX]  
**Priority:** [P0/P1/P2]  
**Estimated Hours:** [Time estimate]  
**Bounded Context:** [Specific implementation domain]

## Summary

[Clear, concise description of what needs to be accomplished]

## Task Type

**Type:** [Feature Implementation | Bug Fix | Refactoring | Testing | Documentation | Configuration | Research]

## Description

[Comprehensive explanation of task requirements, context, and expected outcomes]

## Acceptance Criteria

**Completion Criteria:**

- **Primary deliverable:** [Main output or result expected]
- **Quality standard:** [Code quality, test coverage, or documentation standard]
- **Integration requirement:** [How this integrates with existing system]
- **Verification method:** [How completion will be verified]

**Technical Requirements:**

- **Functionality:** [Specific functional requirements]
- **Performance:** [Performance or efficiency requirements]
- **Security:** [Security considerations or requirements]
- **Compatibility:** [Browser, platform, or system compatibility]

## Implementation Approach

**Technical Design:**
[High-level approach to implementing the task]

**Bounded Context & Modules:**

- **Bounded Context:** [Specific context for implementation]
- **Affected Modules:** [Specific components that will be modified]

**Files to Modify/Create:**

- `path/to/file.ext` - [Purpose of changes]
- `path/to/file.ext` - [What will be modified]
- `path/to/file.ext` - [New file creation purpose]

**Technical Standards References:**

- [Link to relevant Architecture Guidelines section]
- [Link to relevant Code Design Guidelines section]
- [Link to relevant Testing Strategy section]

## Dependencies

**Technical Dependencies:**

- [Required library, service, or component]

**Task Dependencies:**

- [Other tasks that must be completed first]

**Resource Dependencies:**

- [Required access, credentials, or permissions]

## Implementation Steps

1. **Step 1:** [Specific action or milestone]
2. **Step 2:** [Next implementation step]
3. **Step 3:** [Subsequent development action]
4. **Step 4:** [Testing or validation step]
5. **Step 5:** [Documentation or cleanup step]

## Testing Strategy

**Unit Tests:** [Required unit test coverage and scenarios]  
**Integration Tests:** [Integration testing requirements]  
**Manual Testing:** [Manual verification steps needed]

## Notes

[Space for technical decisions, implementation details, or architectural choices]

---

## Task Breakdown Format for Story Body

When appending tasks to a User Story, use this format:

```markdown
## Task Breakdown

- [ ] **T-1**: [Task title]
- [ ] **T-2**: [Task title]
- [ ] **T-3**: [Task title]

---

### T-1: [Task title]

**Priority:** P0 | **Estimated Hours:** 4h | **Bounded Context:** [Context]

**Summary:** [Brief description]

**Type:** Feature Implementation

**Description:** [Detailed explanation]

**Acceptance Criteria:**

- Primary deliverable: [Deliverable]
- Quality standard: [Standard]
- Integration requirement: [Requirement]
- Verification method: [Method]

**Technical Requirements:**

- Functionality: [Requirements]
- Performance: [Requirements]
- Security: [Requirements]

**Implementation Approach:**

- Technical Design: [Approach]
- Bounded Context & Modules: [Context and modules]
- Files to Modify/Create:
  - `path/to/file` - [Purpose]
- Technical Standards: [Links to guidelines]

**Dependencies:**

- Technical: [Dependencies]
- Tasks: [Task dependencies]

**Implementation Steps:**

1. [Step 1]
2. [Step 2]
3. [Step 3]

**Testing Strategy:**

- Unit Tests: [Coverage]
- Integration Tests: [Requirements]

**Notes:** [Any additional context]

---

### T-2: [Task title]

[Repeat format for each task]
```
