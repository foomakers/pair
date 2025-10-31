# AGENTS.md

This repository uses a structured approach for AI agents. **Always start by reading the project context, then identify your task, then follow the specific guidance.**

In all interactions and commit messages, be extremely coincise and sacrify grammar for the sake of coincision.

## 🧠 Session Context (Maintain Throughout Conversation)

**CRITICAL**: Establish and maintain these 4 key pieces of information for the entire session:

```
SESSION STATE:
├── How-to: [which .pair/how-to/XX-*.md file you're following]
├── Role: [product-manager | product-engineer | staff-engineer]
├── PM Tool: [GitHub Projects | Jira | Linear | Trello | etc.]
└── PM Access: [MCP command | URL/location for project management queries]
```

**Example session state:**

```
How-to: 10-how-to-implement-a-task.md
Role: product-engineer
PM Tool: GitHub Projects
PM Access: MCP github_projects (org: mycompany, repo: myproject)
```

### How to establish session context:

1. **Determine how-to**: Use task selection algorithm below
2. **Identify role**: Check user language/request type, or ask if unclear
3. **Find PM tool**: Read `.pair/tech/adopted/way-of-working.md` to get the current project management tool
4. **Get PM access**: Extract tool-specific access instructions from `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md`

**PM Tool Setup Process:**

- **Primary source**: `.pair/tech/adopted/way-of-working.md` (contains the adopted PM tool)
- **Usage instructions**: `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` (contains tool-specific guidance)
- **If tool not specified**: Ask developer which PM tool to use
- **Access details**: Extract MCP commands or URLs from the framework file for your specific tool

**Include this context in ALL subsequent responses** - it ensures consistency and prevents context drift as conversations grow long.

## 🎯 Quick Start Process

1. **Establish session context** (see Session Context above - maintain for entire conversation)
2. **Understand the project**: Read `.pair/product/adopted/PRD.md` for project overview
3. **Identify your task**: Match your request to a task category using `.pair/how-to/index.json`
4. **Follow the guidance**: Use the selected how-to file for specific instructions
5. **Apply constraints**: Check `.pair/tech/adopted/` for technical requirements

## 📋 Available Tasks

**Task index**: `.pair/how-to/index.json` - consult this for precise task matching

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

## 🎭 If unsure about your task

**Use the index**: Load `.pair/how-to/index.json` and match user request keywords to task `tags`

**Workflow categories:**

- **Getting started / new project?** → Induction tasks
- **Planning roadmap / high-level design?** → Strategic tasks
- **Sprint planning / story work?** → Iteration tasks
- **Writing code / implementing?** → Execution tasks
- **Quality checks / reviewing?** → Review tasks

**Role hints in request:**

- Product Manager language → prefer `role_preference: ["product-manager"]` tasks
- Technical/code language → prefer `product-engineer` or `staff-engineer` tasks

**Still unclear?** Show the 2 highest tag-matching tasks and ask the developer to confirm.

## ⚡ Quick Rules

- **Maintain session context** - Always reference your current how-to, role, PM tool, and access method
- **One task per session** - keep changes focused within the current how-to scope
- **Tests required** - follow testing strategy for all code changes
- **Check adoptions first** - `.pair/tech/adopted/` overrides other guidance
- **Package-specific rules win** - check for `.pair/knowledge/guidelines/` in target package
- **No secrets in code** - ask for secure access instructions if needed
- **Context consistency** - if switching how-to mid-session, explicitly update your session context

## 🔄 Task Selection Algorithm

1. **Exact match**: Developer mentions specific how-to ID/filename → use it
2. **Tag matching**: Use `.pair/how-to/index.json` to match request keywords to task tags
3. **Category workflow**: Follow the natural progression (induction → strategic → iteration → execution → review)
4. **Role context**: Consider if developer specified a role (product-manager, product-engineer, staff-engineer)
5. **When ambiguous**: Show top 2 matches with their tags and ask for confirmation

**Example**: "implement login feature" → matches tags `["implement", "feature", "code"]` → task `10-how-to-implement-a-task.md`

---

## 📝 Session Context Examples

**Example 1: Implementation task**

```
SESSION STATE:
├── How-to: 10-how-to-implement-a-task.md
├── Role: product-engineer
├── PM Tool: GitHub Projects
└── PM Access: MCP github_projects --org=mycompany --repo=myproject
```

**Example 2: Planning task**

```
SESSION STATE:
├── How-to: 06-how-to-breakdown-epics.md
├── Role: product-manager
├── PM Tool: Linear
└── PM Access: https://linear.app/myteam/projects/active
```

**Example 3: Review task**

```
SESSION STATE:
├── How-to: 11-how-to-code-review.md
├── Role: staff-engineer
├── PM Tool: Jira
└── PM Access: MCP jira --project=MYPROJ --board=123
```

_This AGENTS.md follows the task-first approach: establish context, identify what you need to do, then follow the specific guidance files consistently throughout the session._
