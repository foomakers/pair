## Task Breakdown

- [ ] **T-1**: Counter command
- [ ] **T-2**: Baseline delta

### Dependency Graph

    T-1 ── T-2

### AC Coverage

| AC                   | Tasks |
| -------------------- | ----- |
| AC-1 (counts)        | T-1   |
| AC-2 (delta)         | T-2   |

---

### T-1: Counter command

**Priority:** P0 | **Estimated Hours:** 4h | **Bounded Context:** CLI

**Summary:** Add `tokens` command.

**Type:** Feature Implementation

**Description:** Count words and tokens per area of markdown the agents load.

**Acceptance Criteria:**

- Primary deliverable: `pair-cli tokens`
- Quality standard: unit and acceptance tests
- Integration requirement: registered in the CLI
- Verification method: acceptance test

**Technical Requirements:**

- Functionality: per-area counts
- Performance: one directory walk
- Security: read-only

**Implementation Approach:**

- Technical Design: walk, count, report
- Bounded Context & Modules: CLI commands
- Files to Modify/Create:
  - `commands/tokens/handler.ts` - counting
- Technical Standards: code-design guidelines

**Dependencies:**

- Technical: none
- Tasks: none

**Implementation Steps:**

1. Write the failing test
2. Implement
3. Refactor

**Testing Strategy:**

- Unit Tests: counting rules
- Integration Tests: CLI run

**Notes:** tokens = ceil(chars / 4).
