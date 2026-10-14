# AGENTS.md

This repository uses a structured approach for AI agents. **Always start by reading the project context, then identify your task, then follow the specific guidance.**

In all interactions and commit messages, be extremely coincise and sacrify grammar for the sake of coincision.

Default style: terse, no recap, no preamble.

Minimal code: the least code that solves the task, no speculative abstractions.

## Skill-Enabled Assistants

If your agent supports **Agent Skills** (agentskills.io), start every session by running:

```text
/next
```

The `/next` skill reads project adoption files and PM tool state to recommend the most relevant action. Follow its suggestion or override with a specific skill.

**No skills installed?** Skip this section and follow the manual Quick Start Process below.

<!-- @claude-skip-start -->
## 🧠 Session Context (Maintain Throughout Conversation)

**CRITICAL**: Establish and maintain these 4 pieces of information for the entire session:

```text
SESSION STATE:
├── How-to: [which .pair/knowledge/how-to/XX-*.md file you're following]
├── Role: [product-manager | product-engineer | staff-engineer]
├── PM Tool: [GitHub Projects | Jira | Linear | Trello | etc.]
└── PM Access: [MCP command | URL/location for project management queries]
```

Example: `How-to: 10-how-to-implement-a-task.md` · `Role: product-engineer` · `PM Tool: GitHub Projects` · `PM Access: MCP github_projects (org: mycompany, repo: myproject)`

### How to establish session context

1. **Determine how-to**: exact match (developer names a how-to ID/filename → use it); otherwise follow "If unsure" below; category progression: induction → strategic → iteration → execution → review; when ambiguous: show top 2 matches with their tags and ask for confirmation
2. **Identify role**: check user language/request type, or ask if unclear
3. **Find PM tool**: read `.pair/adoption/tech/way-of-working.md` (primary source, contains the adopted PM tool); if not specified, ask the developer which PM tool to use
4. **Get PM access**: extract MCP commands or URLs for your tool from `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md`

**Include this context in ALL subsequent responses** - it ensures consistency and prevents context drift as conversations grow long.
<!-- @claude-skip-end -->

## 🎯 Quick Start Process

**With skills**: Run `/next` — it handles steps 1-4 automatically (the profile included: it never proposes a disabled step).

**Without skills** (manual flow):

1. **Establish session context** (see Session Context above - maintain for entire conversation)
2. **Understand the project**: Read `.pair/adoption/product/PRD.md` for project overview
3. **Check the process profile**: Read `.pair/adoption/tech/way-of-working.md` → `## Process Profile`. It declares which process **steps** this project runs. No section = `default` = every step. A step disabled there is one the project does not run — **do not run its how-to guide**; the [step catalogue](.pair/knowledge/guidelines/technical-standards/ai-development/step-catalogue.md) (`step-catalogue.md`) maps every step id to its guide, and the [profile schema](.pair/knowledge/guidelines/technical-standards/ai-development/process-profiles.md) says what an unreadable or unknown declaration does (HALT, never a quiet fallback)
4. **Identify your task**: Match your request to a task category using `.pair/knowledge/how-to/`
5. **Follow the guidance**: Use the selected how-to file for specific instructions
6. **Apply constraints**: Check `.pair/adoption/tech/` for technical requirements

## 📋 Available Tasks

**Task index**: `.pair/knowledge/how-to` - consult this for precise task matching

- **Induction**: Create PRD → `01-how-to-create-PRD.md` (prd, requirements, planning); Setup project → `02-how-to-complete-bootstrap-checklist.md` (bootstrap, setup, onboarding, subdomain, bounded-context, domain-model)
- **Strategic**: Plan initiatives → `03-how-to-create-and-prioritize-initiatives.md` (initiative, roadmap, subdomain); Break down epics → `06-how-to-breakdown-epics.md` (epic, breakdown, subdomain)
- **Iteration**: Create user stories → `07-how-to-breakdown-user-stories.md` (story, requirements); Refine stories → `08-how-to-refine-a-user-story.md` (refine, acceptance, criteria); Create tasks → `09-how-to-create-tasks.md` (task, breakdown, assign, bounded-context)
- **Execution**: Implement feature → `10-how-to-implement-a-task.md` (implement, feature, code)
- **Review**: Code review → `11-how-to-code-review.md` (review, code, approve)

## 🛠️ Essential Commands

```bash
pnpm install                                           # setup
pnpm dlx turbo run --filter <package_name> <task>      # development
pnpm --filter <package_name> dev
pnpm --filter <package_name> test                      # testing
pnpm vitest run -t "<test name>"
pnpm lint --filter <package_name>                      # quality checks
```

## 📚 Key References

- **AI-friendly index**: `.pair/llms.txt` (llmstxt.org — machine-readable knowledge base index)
- **Project context**: `.pair/adoption/product/PRD.md`
- **PM tool adoption**: `.pair/adoption/tech/way-of-working.md` (determines which PM tool to use)
- **PM tool usage**: `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` (tool-specific instructions)
- **Technical decisions**: `.pair/adoption/tech/` (architecture, tech-stack, infrastructure)
- **Testing strategy**: `.pair/knowledge/guidelines/testing/README.md`
- **Code guidelines**: `.pair/knowledge/guidelines/code-design/README.md`
- **Security rules**: `.pair/knowledge/guidelines/quality-assurance/security/security-guidelines.md`

<!-- @claude-skip-start -->
## 🎭 If unsure about your task

**Use the index**: Load `.pair/knowledge/how-to/` and match user request keywords to task `tags`

- **Getting started / new project?** → Induction tasks
- **Planning roadmap / high-level design?** → Strategic tasks
- **Sprint planning / story work?** → Iteration tasks
- **Writing code / implementing?** → Execution tasks
- **Quality checks / reviewing?** → Review tasks

Role hints: Product Manager language → prefer `role_preference: ["product-manager"]` tasks; technical/code language → prefer `product-engineer` or `staff-engineer` tasks.

**Still unclear?** Show the 2 highest tag-matching tasks and ask the developer to confirm.
<!-- @claude-skip-end -->

## ⚡ Quick Rules

- **Maintain session context** - Always reference your current how-to, role, PM tool, and access method
- **One task per session** - keep changes focused within the current how-to scope
- **Tests required** - follow testing strategy for all code changes
- **Check adoptions first** - `.pair/adoption/tech/` overrides other guidance
- **Package-specific rules win** - check for `.pair/knowledge/guidelines/` in target package
- **No secrets in code** - ask for secure access instructions if needed
- **Context consistency** - if switching how-to mid-session, explicitly update your session context
- **Bug fix workflow** - NEVER modify code to fix a bug before creating a test that reproduces it. Test-first debugging ensures the fix actually addresses the problem.
- **`.pair/working/` is not ambient context** - Content under `.pair/working/` (checkpoints, reports, handoffs) is never loaded as context unless explicitly specified. The skills that use it decide if and how.
- **Record decisions** - architectural/project decisions MUST be recorded as ADR or ADL. Use `/record-decision` skill or write to `.pair/adoption/tech/adr/` (architectural) / `.pair/adoption/decision-log/` (non-architectural).
- **Follow templates** - PRs, code reviews, commits, branches, tasks, user stories MUST follow templates in `.pair/knowledge/guidelines/collaboration/templates/` unless adoption files specify otherwise. Key templates: `pr-template.md`, `code-review-template.md`, `commit-template.md`, `branch-template.md`, `task-template.md`, `user-story-template.md`.

## 🐛 Bug Resolution Workflow

**Critical principle**: Test-first debugging proves the fix, prevents regressions, documents behavior. Confidence: lint + tests pass before committing.

1. **Understand the bug** - Read error messages, logs, and problem descriptions thoroughly
2. **Create a failing test** - Write a test that reproduces the bug (test should FAIL)
3. **Verify test fails** - Run test to confirm it fails with the expected error
4. **Fix the code** - Make minimal code changes to make the test pass
5. **Verify fix** - Run all tests to ensure fix doesn't break anything else
6. **Clean up** - Refactor and optimize once the test passes

Example: `isLocalPath('/absolute/path')` expected `true`, returns `false` → write that failing test first, then fix `str.startsWith('/') || str.startsWith('./')`, then re-run.
