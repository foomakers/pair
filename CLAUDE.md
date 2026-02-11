# AGENTS.md

This repository uses a structured approach for AI agents. **Always start by reading the project context, then identify your task, then follow the specific guidance.**

In all interactions and commit messages, be extremely coincise and sacrify grammar for the sake of coincision.

## Skill-Enabled Assistants

If your agent supports **Agent Skills** (agentskills.io), start every session by running:

```
/next
```

The `/next` skill reads project adoption files and PM tool state to recommend the most relevant action. Follow its suggestion or override with a specific skill.

**No skills installed?** Skip this section and follow the manual Quick Start Process below.

## 🎯 Quick Start Process

**With skills**: Run `/next` — it handles steps 1-3 automatically.

**Without skills** (manual flow):

1. **Establish session context** (see Session Context above - maintain for entire conversation)
2. **Understand the project**: Read `.pair/product/adopted/PRD.md` for project overview
3. **Identify your task**: Match your request to a task category using `.pair/how-to/index.json`
4. **Follow the guidance**: Use the selected how-to file for specific instructions
5. **Apply constraints**: Check `.pair/tech/adopted/` for technical requirements

## 📋 Available Tasks

**Task index**: `.pair/knowledge/how-to` - consult this for precise task matching

### Induction (Getting Started)

- **Create PRD** → `01-how-to-create-PRD.md` | Tags: prd, requirements, planning
- **Setup project** → `02-how-to-complete-bootstrap-checklist.md` | Tags: bootstrap, setup, onboarding
- **Define subdomains** → `04-how-to-define-subdomains.md` | Tags: subdomain, domain, model

### Strategic (High-level Planning)

- **Plan initiatives** → `03-how-to-create-and-prioritize-initiatives.md` | Tags: initiative, roadmap
- **Define architecture** → `05-how-to-define-bounded-contexts.md` | Tags: bounded, context, architecture
- **Break down epics** → `06-how-to-breakdown-epics.md` | Tags: epic, breakdown

### Iteration (Sprint Planning)

- **Create user stories** → `07-how-to-breakdown-user-stories.md` | Tags: story, requirements
- **Refine stories** → `08-how-to-refine-a-user-story.md` | Tags: refine, acceptance, criteria
- **Create tasks** → `09-how-to-create-tasks.md` | Tags: task, breakdown, assign

### Execution (Development)

- **Implement feature** → `10-how-to-implement-a-task.md` | Tags: implement, feature, code

### Review (Quality Assurance)

- **Code review** → `11-how-to-code-review.md` | Tags: review, code, approve

## 🛠️ Essential Commands

```bash
# Setup
pnpm install

# Development
pnpm dlx turbo run --filter <package_name> <task>
pnpm --filter <package_name> dev

# Testing
pnpm --filter <package_name> test
pnpm vitest run -t "<test name>"

# Quality checks
pnpm lint --filter <package_name>
```

## 📚 Key References

- **Project context**: `.pair/product/adopted/PRD.md`
- **PM tool adoption**: `.pair/tech/adopted/way-of-working.md` (determines which PM tool to use)
- **PM tool usage**: `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` (tool-specific instructions)
- **Technical decisions**: `.pair/tech/adopted/` (architecture, tech-stack, infrastructure)
- **Testing strategy**: `.pair/tech/knowledge-base/07-testing-strategy.md`
- **Code guidelines**: `.pair/tech/knowledge-base/02-code-design-guidelines.md`
- **Security rules**: `.pair/tech/knowledge-base/10-security-guidelines.md`

## ⚡ Quick Rules

- **Maintain session context** - Always reference your current how-to, role, PM tool, and access method
- **One task per session** - keep changes focused within the current how-to scope
- **Tests required** - follow testing strategy for all code changes
- **Check adoptions first** - `.pair/tech/adopted/` overrides other guidance
- **Package-specific rules win** - check for `.pair/knowledge/guidelines/` in target package
- **No secrets in code** - ask for secure access instructions if needed
- **Context consistency** - if switching how-to mid-session, explicitly update your session context
- **Bug fix workflow** - NEVER modify code to fix a bug before creating a test that reproduces it. Test-first debugging ensures the fix actually addresses the problem.

## 🐛 Bug Resolution Workflow

**Critical principle**: Test-first debugging prevents code changes that don't fix the actual problem.

### Process

1. **Understand the bug** - Read error messages, logs, and problem descriptions thoroughly
2. **Create a failing test** - Write a test that reproduces the bug (test should FAIL)
3. **Verify test fails** - Run test to confirm it fails with the expected error
4. **Fix the code** - Make minimal code changes to make the test pass
5. **Verify fix** - Run all tests to ensure fix doesn't break anything else
6. **Clean up** - Refactor and optimize once the test passes

### Example Bug Fix

```typescript
// ❌ WRONG: modifying code before understanding the bug
// Just changing things hoping it works

// ✅ RIGHT: create test first, then fix
// Step 1: Write failing test
test('should handle local path in --url parameter', () => {
  const result = isLocalPath('/absolute/path')
  expect(result).toBe(true) // This FAILS first
})

// Step 2: Verify it fails
// $ pnpm test  →  FAIL: expected false to equal true

// Step 3: Fix the code
function isLocalPath(str: string): boolean {
  return str.startsWith('/') || str.startsWith('./')
  // was missing slash check
}

// Step 4: Verify test passes
// $ pnpm test  →  PASS
```

### Key Benefits

- **Evidence-based**: Proves the fix actually works
- **Regression prevention**: Test stays in codebase to catch future breaks
- **Clarity**: Test documents expected behavior
- **Confidence**: Linting + tests pass before committing

