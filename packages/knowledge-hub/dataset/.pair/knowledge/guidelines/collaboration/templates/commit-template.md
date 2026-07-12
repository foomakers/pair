# Commit Message Template

## Standard Commit Message Format

```text
[STORY_CODE] [type]: [concise description]

[optional body explaining the what and why vs. how]

[optional footer with references and breaking changes]
```

## Commit Types

| Type         | Purpose                                  | Example                                            |
| ------------ | ---------------------------------------- | -------------------------------------------------- |
| **feat**     | New feature implementation               | `[US-123] feat: implement user authentication`     |
| **fix**      | Bug fix or issue correction              | `[US-123] fix: resolve login validation error`     |
| **refactor** | Code improvement without behavior change | `[US-123] refactor: optimize database queries`     |
| **test**     | Adding or updating tests                 | `[US-123] test: add unit tests for user service`   |
| **docs**     | Documentation changes                    | `[US-123] docs: update API documentation`          |
| **chore**    | Non-functional tasks                     | `[US-123] chore: update dependencies`              |
| **style**    | Code style/formatting changes            | `[US-123] style: apply ESLint formatting`          |
| **perf**     | Performance improvements                 | `[US-123] perf: optimize image loading`            |
| **build**    | Build system or dependency changes       | `[US-123] build: configure webpack for production` |
| **ci**       | CI/CD configuration changes              | `[US-123] ci: add automated testing workflow`      |

## TDD Workflow Commit Patterns

### Red Phase (Failing Tests)

```text
[US-123] test: add failing tests for user authentication

- Add test for valid login credentials
- Add test for invalid password handling
- Add test for user session creation

Refs: #T-456
```

### Green Phase (Implementation)

```text
[US-123] feat: implement user authentication service

- Add user credential validation
- Implement session management
- Add password hashing with bcrypt
- Handle authentication errors

Refs: #T-456
```

### Refactor Phase (Code Improvement)

```text
[US-123] refactor: improve authentication code structure

- Extract validation logic to separate module
- Simplify error handling flow
- Optimize password comparison performance
- Add comprehensive code documentation

Refs: #T-456
```

## Commit Message Example

```text
[US-789] feat: add real-time notifications system

Implement WebSocket-based notification delivery:
- Add WebSocket server configuration
- Create notification event handlers
- Implement client-side notification display

This enables users to receive instant updates without page refresh.

Refs: #T-234, #T-235
```

The same structure applies to every type (fix, refactor, docs, chore, ...): subject line, optional body with bullets explaining what and why, optional footer with references.

## Commit Message Guidelines

### Subject Line Rules

- **Length:** Keep under 50 characters for optimal display
- **Format:** `[STORY_CODE] type: description`
- **Tense:** Use imperative mood ("add" not "added" or "adds")
- **Capitalization:** Lowercase after the colon
- **Punctuation:** No period at the end

### Body Guidelines

- **When to include:** Add body for complex changes needing explanation
- **Line length:** Wrap at 72 characters for readability
- **Content focus:** Explain _what_ and _why_, not _how_
- **Bullet points:** Use for listing multiple related changes

### Footer Information

- **References:** Include related task/issue numbers
- **Breaking changes:** Note any breaking changes explicitly
- **Co-authors:** Credit co-authors if pair programming

## Story Code Format

### User Story References

```text
Format: [US-###] - User Story number
Example: [US-123] feat: implement search functionality
```

### Task References

```text
Format: [T-###] - Task number (in commit body)
Example: Refs: #T-456, #T-789
```

### Bug References

```text
Format: [BUG-###] - Bug tracking number
Example: Closes #BUG-123
```

Non-code tasks (documentation, configuration, infrastructure) follow the same format with the matching type (`docs`, `chore`, `build`, `ci`).

## Quality Checklist

Before committing, ensure:

### Code Quality

- [ ] Code follows established style guidelines
- [ ] All tests pass successfully
- [ ] No debugging code or console logs left behind
- [ ] Code is properly documented where needed

### Commit Message Quality

- [ ] Story code is correctly formatted and valid
- [ ] Commit type accurately reflects the change
- [ ] Description is clear and concise
- [ ] Body explains the reasoning when necessary

### Change Organization

- [ ] Commit represents a single logical change
- [ ] Related changes are grouped together appropriately
- [ ] Unrelated changes are in separate commits
- [ ] Commit is complete and doesn't break functionality

## Atomic Commit Principles

- **Single responsibility**: one logical change per commit (not bug fix + feature + docs together)
- **Complete functionality**: each commit leaves the codebase in a working state
- **Meaningful scope**: one component or one issue — never a massive commit touching unrelated areas

## Branch and Merge Strategy

### Squash Merge Strategy

When using squash merge, final commit should summarize the feature:

```text
[US-123] feat: implement advanced user search

Complete implementation of user search functionality including:
- Full-text search across user profiles
- Advanced filtering and sorting options
- Performance optimization for large datasets
- Comprehensive test coverage
- API documentation

Closes #T-234, #T-235, #T-236
```

### Merge Commit Strategy

When preserving commit history, each commit in the branch must be clean and follow the standards above.

---

## Common Anti-Patterns to Avoid

❌ Vague messages (`fix stuff`, `WIP`, `update code`) — ✅ `[US-123] fix: resolve null pointer in user validation`
❌ Mixed unrelated changes in one commit — ✅ separate logical commits per story/type
❌ Complex change with no body — ✅ body explaining what and why, with refs
