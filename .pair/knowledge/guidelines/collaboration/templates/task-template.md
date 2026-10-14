# Task Template

<!-- word-limits: Task Information=30; Summary=30; Task Type=10; Description=80; Acceptance Criteria=90; Implementation Approach=120; Dependencies=50; Implementation Steps=70; Testing Strategy=50; Notes=50; Task Breakdown Format for Story Body=60; Task Breakdown=500 -->

> Documents individual tasks in a User Story's Task Breakdown; tasks are appended to the story body in this format.

## Task Information

**Task ID:** [T-XXX]  
**Priority:** [P0/P1/P2]  
**Estimated Hours:** [Time estimate]  
**Bounded Context:** [Specific implementation domain]

## Summary

[What needs to be accomplished]

## Task Type

**Type:** [Feature Implementation | Bug Fix | Refactoring | Testing | Documentation | Configuration | Research]

## Description

[Requirements, context, expected outcomes]

## Acceptance Criteria

#### Completion Criteria:

- **Primary deliverable:** [Main output]
- **Quality standard:** [Code quality, test coverage or documentation standard]
- **Integration requirement:** [Integration with the existing system]
- **Verification method:** [How completion is verified]

#### Technical Requirements:

- **Functionality:** [Functional requirements]
- **Performance:** [Performance or efficiency]
- **Security:** [Security]
- **Compatibility:** [Browser, platform or system]

## Implementation Approach

**Technical Design:**
[High-level approach]

#### Bounded Context & Modules:

- **Bounded Context:** [Implementation context]
- **Affected Modules:** [Components modified]

#### Files to Modify/Create:

- `path/to/file.ext` - [Purpose]
- `path/to/file.ext` - [What is modified]
- `path/to/file.ext` - [New file purpose]

#### Technical Standards References:

- [Architecture Guidelines section]
- [Code Design Guidelines section]
- [Testing Strategy section]

## Dependencies

#### Technical Dependencies:

- [Library, service or component]

#### Task Dependencies:

- [Tasks to complete first]

#### Resource Dependencies:

- [Access, credentials or permissions]

## Implementation Steps

1. **Step 1:** [Action or milestone]
2. **Step 2:** [Next step]
3. **Step 3:** [Next development action]
4. **Step 4:** [Testing or validation]
5. **Step 5:** [Documentation or cleanup]

## Testing Strategy

**Unit Tests:** [Coverage and scenarios]  
**Integration Tests:** [Requirements]  
**Manual Testing:** [Verification steps]

## Notes

[Technical decisions, implementation details, architectural choices]

---

## Task Breakdown Format for Story Body

Appended after Technical Analysis (last content section of the story body, before the footer):

```markdown
## Task Breakdown

- [ ] **T-1**: [Task title]
- [ ] **T-2**: [Task title]
- [ ] **T-3**: [Task title]

### Dependency Graph

    T-1 ──┬── T-2 ── T-4
          └── T-3 ── T-5
                       │
    T-4 + T-5 ──── T-6

### AC Coverage

| AC                   | Tasks    |
| -------------------- | -------- |
| AC-1 ([brief label]) | T-1, T-3 |
| AC-2 ([brief label]) | T-2      |
| AC-3 ([brief label]) | T-2, T-4 |

---

### T-1: [Task title]

**Priority:** P0 | **Estimated Hours:** 4h | **Bounded Context:** [Context]

**Summary:** [Description]

**Type:** Feature Implementation

**Description:** [Explanation]

**Acceptance Criteria:**

- Primary deliverable: […]
- Quality standard: […]
- Integration requirement: […]
- Verification method: […]

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

**Notes:** [Context]

---

### T-2: [Task title]

[Repeat per task]
```
