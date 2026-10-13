# Commit Message Template

<!-- word-limits: Standard Commit Message Format=40; Commit Types=90; TDD Workflow Commit Patterns=120; Commit Message Example=80; Commit Message Guidelines=110; Story Code Format=70; Quality Checklist=90; Atomic Commit Principles=50; Branch and Merge Strategy=90; Common Anti-Patterns to Avoid=50; subject ≤50 chars, body ≤80 words -->

## Standard Commit Message Format

```text
[STORY_CODE] [type]: [concise description]

[optional body: what and why, not how]

[optional footer: references, breaking changes]
```

## Commit Types

Format `[US-123] type: description`, e.g. `[US-123] feat: implement user authentication`.

| Type         | Purpose                                  |
| ------------ | ---------------------------------------- |
| **feat**     | New feature implementation               |
| **fix**      | Bug fix or issue correction              |
| **refactor** | Code improvement without behavior change |
| **test**     | Adding or updating tests                 |
| **docs**     | Documentation changes                    |
| **chore**    | Non-functional tasks                     |
| **style**    | Code style/formatting changes            |
| **perf**     | Performance improvements                 |
| **build**    | Build system or dependency changes       |
| **ci**       | CI/CD configuration changes              |

## TDD Workflow Commit Patterns

Red (failing tests) → `[US-123] test: add failing tests for user authentication`. Green (implementation) → `[US-123] feat: implement user authentication service`. Refactor → `[US-123] refactor: improve authentication code structure`. Each has a bullet body (what changed) and `Refs: #T-456`:

```text
[US-123] test: add failing tests for user authentication

- Add test for valid login credentials
- Add test for invalid password handling

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

Every type (fix, refactor, docs, chore, ...) has the same structure: subject line, optional body with bullets (what and why), optional footer with references.

## Commit Message Guidelines

- **Subject:** `[STORY_CODE] type: description`; under 50 characters; imperative mood ("add", not "added"); lowercase after the colon; no final period.
- **Body:** only for complex changes; wrap at 72 characters; explain _what_ and _why_, not _how_; bullets for several related changes.
- **Footer:** related task/issue numbers; breaking changes stated explicitly; co-authors credited if pair programming.

## Story Code Format

- User story: `[US-###]`, e.g. `[US-123] feat: implement search functionality`
- Task (commit body): `[T-###]`, e.g. `Refs: #T-456, #T-789`
- Bug: `[BUG-###]`, e.g. `Closes #BUG-123`

Non-code tasks (documentation, configuration, infrastructure) use the same format with the matching type (`docs`, `chore`, `build`, `ci`).

## Quality Checklist

- [ ] Style guidelines followed; all tests pass; no debugging code or console logs left; code documented where needed
- [ ] Story code valid; type matches the change; description clear and concise; body explains the reasoning when necessary
- [ ] One logical change per commit; related changes grouped, unrelated ones separate; commit complete and does not break functionality

## Atomic Commit Principles

- **Single responsibility**: one logical change per commit (not bug fix + feature + docs together)
- **Complete functionality**: each commit leaves the codebase working
- **Meaningful scope**: one component or one issue, never a massive commit across unrelated areas

## Branch and Merge Strategy

Squash merge: the final commit summarizes the feature.

```text
[US-123] feat: implement advanced user search

Complete implementation of user search functionality including:
- Full-text search across user profiles
- Advanced filtering and sorting options
- Comprehensive test coverage

Closes #T-234, #T-235, #T-236
```

Merge commit (history preserved): each commit in the branch must be clean and follow the standards above.

## Common Anti-Patterns to Avoid

- Vague messages (`fix stuff`, `WIP`, `update code`) → `[US-123] fix: resolve null pointer in user validation`
- Mixed unrelated changes in one commit → separate logical commits per story/type
- Complex change with no body → body explaining what and why, with refs
