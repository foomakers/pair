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

## Commit Message Examples

### Feature Implementation

```text
[US-789] feat: add real-time notifications system

Implement WebSocket-based notification delivery:
- Add WebSocket server configuration
- Create notification event handlers
- Implement client-side notification display
- Add notification persistence to database

This enables users to receive instant updates without page refresh,
improving user engagement and system responsiveness.

Refs: #T-234, #T-235
```

### Bug Fix

```text
[US-456] fix: resolve memory leak in data processing

- Fix unclosed database connections in batch processor
- Add proper cleanup in error handling paths
- Implement connection pooling timeout
- Add memory usage monitoring

The memory leak was causing application crashes during large
data imports. This fix ensures proper resource cleanup and
adds monitoring to prevent future issues.

Closes #BUG-123
```

### Refactoring

```text
[US-321] refactor: restructure user management module

- Extract user validation into separate service
- Simplify user creation workflow
- Improve error handling consistency
- Add comprehensive unit test coverage

No functional changes - purely code organization improvement
for better maintainability and testability.

Refs: #T-567
```

### Documentation

```text
[US-654] docs: add API documentation for user endpoints

- Document authentication endpoints
- Add request/response examples
- Include error code explanations
- Add usage examples for common scenarios

Refs: #T-890
```

### Configuration/Setup

```text
[US-987] chore: configure production deployment pipeline

- Add Docker configuration for production
- Set up environment variable management
- Configure health check endpoints
- Add logging and monitoring setup

Refs: #T-111
```

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

## Non-Code Task Commits

### Documentation Tasks

```text
[US-456] docs: update user onboarding guide

- Add screenshots for new UI elements
- Update step-by-step instructions
- Include troubleshooting section
- Add FAQ for common issues

Refs: #T-789
```

### Configuration Changes

```text
[US-123] chore: update project configuration

- Configure ESLint rules for TypeScript
- Add Prettier formatting configuration
- Update package.json scripts
- Add VS Code workspace settings

Refs: #T-234
```

### Infrastructure Setup

```text
[US-789] build: setup CI/CD pipeline

- Add GitHub Actions workflow configuration
- Configure automated testing on pull requests
- Set up deployment to staging environment
- Add code quality checks

Refs: #T-345
```

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

### Single Responsibility

Each commit should represent one logical change:

- ✅ Good: Fix one specific bug
- ❌ Bad: Fix bug + add new feature + update documentation

### Complete Functionality

Commits should leave the codebase in a working state:

- ✅ Good: Complete feature implementation with tests
- ❌ Bad: Partial implementation that breaks build

### Meaningful Scope

Commit scope should be appropriately sized:

- ✅ Good: Implement one component or fix one issue
- ❌ Bad: Massive commit touching unrelated areas

## Branch and Merge Strategy

### Feature Branch Commits

```text
# During feature development
[US-123] test: add failing tests for user search
[US-123] feat: implement basic search functionality
[US-123] refactor: optimize search performance
[US-123] docs: document search API endpoints
```

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

When preserving commit history, ensure each commit follows guidelines:

```text
# Each commit in the branch should be clean and follow standards
[US-123] test: add unit tests for search service
[US-123] feat: implement search backend API
[US-123] feat: create search UI components
[US-123] refactor: optimize search query performance
```

---

## Common Anti-Patterns to Avoid

### Poor Commit Messages

❌ **Bad Examples:**

```text
fix stuff
WIP
asdf
update code
fix bug
```

✅ **Good Examples:**

```text
[US-123] fix: resolve null pointer in user validation
[US-456] feat: add email notification service
[US-789] refactor: extract common validation logic
```

### Inappropriate Grouping

❌ **Bad:** Mixed unrelated changes

```text
[US-123] feat: add user search + fix login bug + update docs
```

✅ **Good:** Separate logical commits

```text
[US-123] feat: add user search functionality
[US-124] fix: resolve login validation error
[US-123] docs: update search API documentation
```

### Missing Context

❌ **Bad:** No explanation for complex changes

```text
[US-123] refactor: change user service
```

✅ **Good:** Clear explanation of reasoning

```text
[US-123] refactor: extract user validation to separate service

- Move validation logic from controller to dedicated service
- Improve testability and code reuse
- Prepare for upcoming role-based permissions feature

Refs: #T-456
```
