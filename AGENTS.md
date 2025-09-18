# AGENTS.md

This AGENTS.md focuses on process: for every developer-requested work session, the agent must determine which "how-to" activity to run from `.pair/how-to/`, then follow the corresponding guidance in `.pair/tech/knowledge-base/` in accordance with the adoptions in `.pair/tech/adopted/`.

Purpose: give agents a single, predictable, process-first source of truth so they can execute tasks, follow local policies, and create PRs that match project conventions.

## High-level process (per session)

1. Identify the requested work. If the developer's message references a how-to by name or number (for example "implement task using 10-how-to-implement-a-task.md"), select that file from `.pair/how-to/`.
2. If the developer request is informal (e.g. "add feature X"), attempt to map it to the closest how-to in `.pair/how-to/` by semantic match. Prefer exact matches; if uncertain, list the top 2 candidate how-tos and ask the developer to confirm.
3. Read the selected how-to file thoroughly. Then, _before making any design or implementation decisions_, consult the repository-level adoptions in `.pair/tech/adopted/` and the relevant package-level guidelines (for example `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/`). The chosen how-to defines the activity; the adopted policies and package guidelines define _how_ that activity must be executed.

- The agent MUST apply adopted decisions for architecture, tech-stack, infrastructure, and way-of-working when they affect the requested activity.
- If a package has its own `.pair/knowledge/guidelines` or similar, those package rules override generic guidance for that package's scope.

4. Run the setup and checks from this repository (see "Quick commands"). Fix any easily-automatable issues (build, types, lint, tests) before implementing new behavior.
5. Implement the requested change in small, test-covered commits. Update or add tests per the how-to and knowledge-base guidance.
6. Run full test and lint suite for affected packages. If failures remain and cannot be fixed in-session, report the failing tests with exact error output and a short remediation plan.
7. Open a PR using the project's PR conventions. Include references to the how-to and knowledge-base sections you followed.

Keep changes minimal per session unless the developer explicitly asks for a larger scope.

## Minimal contract (what the agent must guarantee per session)

- Inputs: developer request (message + optional file paths), repo tree, nearest how-to file, `.pair/tech/adopted/`, package-level guidelines.
- Outputs: small set of focused code changes or tests, updated/added tests, a concise PR with references to how-to and adopted/guidelines, and a short remediation plan if blockers were encountered.
- Error modes: ambiguous how-to mapping, failing tests that cannot be fixed automatically, conflicts between how-to and adopted policies.

## Edge cases and how to handle them

- Ambiguous how-to mapping: show top 2 candidates to the developer and ask which to follow.
- Conflict between how-to and adopted/policy: prefer the adopted/policy. Document the conflict and the rationale in the PR. If the conflict blocks the task, ask the developer for resolution.
- Large-scope requests that touch many packages: require developer confirmation and propose breaking the work into smaller how-to aligned steps.
- Secrets/data requirements: if the task needs credentials or private datasets, ask the developer for secure access instructions; do not proceed with hard-coded secrets.

## Mapping tasks to `.pair/how-to/`

- Exact match: use the filename or the number prefix (e.g. `10-how-to-implement-a-task.md`).
- Fuzzy match: compare task verbs (implement, test, create PR, code review, etc.) and choose the best matching how-to. If top candidate has similarity < 0.6 (or ambiguous), ask the dev to confirm.
- If multiple how-tos apply (e.g. implement + testing), follow them in order: implement -> add tests -> create PR.

Important: choices made when following a how-to must conform to the repository's adopted decisions and package guidelines. See the "Adopted" folder and package-level guidelines for required constraints:

- Global adoptions: `.pair/tech/adopted/` (architecture, infrastructure, tech-stack, way-of-working, etc.)
- Package / dataset guidelines: e.g. `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/`

When there is a conflict between a how-to's suggested steps and the adopted policies or package guidelines, follow the adopted/guidelines and record the deviation rationale in the PR description. If the conflict blocks completion, ask the developer which preference to apply.

## Using the how-to index for faster matching

This repo includes a lightweight index at `.pair/how-to/index.json` that maps how-to filenames to categories, tags and priorities. Agents should consult this index as the first deterministic step when resolving informal developer requests.

Selection algorithm (recommended):

1. Exact match: if the message contains the how-to filename or ID, select it.
2. Tag match: tokenize the request, count tag overlaps against entries in `index.json`. If an entry has overlap >= 2 tokens (or >=1 for very short requests), pick the highest-overlap entry.
3. Role-aware tie-breaker: if multiple entries tie on overlap, prefer the how-to whose `role_preference` list best matches the requesting persona (for example `product-manager`, `product-engineer`, `staff-engineer`).

- If the request includes a persona (e.g., the developer asks to act as `product-engineer`), prefer entries that list that role earlier in `role_preference`.
- If no persona is provided, prefer the entry whose `role_preference` contains a commonly implied role for the task category (execution -> `product-engineer`, review -> `staff-engineer`, induction/strategy -> `product-manager`).

4. Semantic fallback: if no tag passes the threshold, run semantic search against the how-to files or fall back to `semantic matching` with embeddings (threshold ~0.6).
5. Confirm: if after the above the top candidate is ambiguous, present the top-2 candidates to the developer and ask which to use.

Optional: tag weighting

- You may optionally weight tags by category or role to influence matching (for example, give "implement" tags higher weight when request indicates code work). This adds complexity; prefer simple tag overlap first and use weighting only if you observe repeated mismatches.

Thresholds and tuning

- Tag overlap threshold: default 2 tokens (lower to 1 for very short requests). Adjust if your how-to tags become more or less granular.
- Embedding similarity threshold: default 0.6 (tune based on observed precision/recall).

Maintenance

- Keep `.pair/how-to/index.json` in sync with `.pair/how-to/`. Add a simple validation test that fails CI if any how-to file is missing from the index.
- Optionally, generate `index.json` from frontmatter in the how-to markdown files using a small script when adding new how-tos.

Example usage snippet (pseudocode)

1. Load `.pair/how-to/index.json`.
2. Attempt exact/ID match.
3. Tokenize request and compute tag overlap.
4. If insufficient overlap, compute semantic similarity to each how-to and choose the best match.
5. If still ambiguous, ask the developer.

## Quick commands (monorepo tooling)

Run these from the repository root unless the how-to specifies otherwise.

pnpm install
pnpm dlx turbo run --filter <package_name> <task>
pnpm --filter <package_name> test
pnpm vitest run -t "<test name>"
pnpm lint

Note: check `package.json` name fields for the correct filter values.

## Locate and keep the project management tool in context 🗂️

The repository's adopted project management tool should be determined from `.pair/tech/adopted/way-of-working.md`. The agent must read that file first and extract the chosen tool (and any access hints such as organization or MCP references). If the adopted tool is not specified there, the agent should explicitly ask the developer which tool to use.

Guidelines:

- Primary source: `.pair/tech/adopted/way-of-working.md` — read this file to determine the adopted project management tool and any organization/board hints.
- If the adoption file doesn't name a tool, ask the developer: "Which project management tool should I use for backlog access (e.g., GitHub Projects, Jira, Linear, Trello)?"
- Keep the chosen tool (name, org/board info, and any access notes) in the session context for the entire iteration so all subsequent steps use the same source-of-truth.
- Do not hardcode tool-specific commands or workflows in `AGENTS.md`; instead, follow the tool usage instructions and templates in `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` (and the linked `project-management-framework-<tool>.md` implementation guide for the chosen tool).

This section defines how the agent should choose and retain the project management tool for the work session; concrete usage, queries, templates and automation details are in the project management framework document referenced above.

## Policies and conventions (where to find them)

- Implementation and design: `.pair/tech/knowledge-base/01-architectural-guidelines.md`, `02-code-design-guidelines.md`
- Testing: `.pair/tech/knowledge-base/07-testing-strategy.md`
- Security: `.pair/tech/knowledge-base/10-security-guidelines.md`
- Observability: `.pair/tech/knowledge-base/11-observability-guidelines.md`
- Collaboration & process: `.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/`

Agents must follow the guidance in these files when they conflict with local preferences.

## Commit, PR and review rules

- Commit messages: be concise and reference the how-to and ticket/issue when available.
- Tests: every behavioural change must include tests (unit and/or integration depending on the how-to).
- PR title: `[<package_name>] <short summary>`
- PR description: include
  - Which how-to was followed (filename)
  - Which knowledge-base sections were applied
  - Test plan and commands to reproduce

Before marking a PR ready, run:

pnpm lint --filter <package_name>
pnpm --filter <package_name> test

If tests fail intermittently, document the flakiness, attempt a retry, and include failure logs in the PR.

## Safety and secrets

- Never commit secrets or credentials. Search for common secret patterns before committing.
- If a task requires sensitive data (keys, datasets), request instructions from the developer and follow the repository's secrets policy.

## Observability and logging

- Follow `.pair/tech/knowledge-base/11-observability-guidelines.md` for logging levels, metric names, and tracing spans.
- Add minimal, useful logs and metrics for new runtime behaviour.

## Error handling and reporting

- When encountering build/lint/test failures that cannot be fixed automatically, produce a short report containing:
  - Command run and full stdout/stderr
  - Files changed
  - Suggested fixes (1-3 concrete next steps)

## When to ask the developer questions

- The agent should ask for clarification when:
  - The how-to to run is ambiguous or multiple how-tos plausibly match
  - A test or build fails with non-obvious errors
  - The requested change would touch many packages in scope and the developer didn't confirm scope

Keep questions specific and include context: affected files, failing commands, and proposed options.

## Local AGENTS.md precedence

If an `AGENTS.md` exists in a subdirectory nearer to the target file, prefer that one over the root file. Subproject AGENTS.md can override process details for that package.

## Examples

- Developer: "Please implement X and open a PR" → Agent maps to `10-how-to-implement-a-task.md`, follows the step-by-step implement->test->lint->pr flow, cites `07-testing-strategy.md` for test coverage requirements, and opens PR `[packages/x] add X (follow .pair/how-to/10...)`.

## Activities mapped to way-of-working phases

Below is a process-aligned mapping of common activities to the `.pair/how-to/` files and selection criteria an agent should use when deciding the next unit of work.

1. Induction (product foundation)

   - Typical activities and how-to:
     - Create PRD → `01-how-to-create-PRD.md`
     - Complete bootstrap checklist → `02-how-to-complete-bootstrap-checklist.md`
     - Create & prioritize initiatives → `03-how-to-create-and-prioritize-initiatives.md`
     - Define subdomains → `04-how-to-define-subdomains.md`
   - Selection criteria:
     - Run these when starting a new product, initiative, or repository/subproject.
     - If project health is unknown, run the bootstrap checklist first.

2. Strategic Initiatives

   - Typical activities and how-to:
     - Break initiatives into epics → `06-how-to-breakdown-epics.md`
     - Prioritize initiatives → `03-how-to-create-and-prioritize-initiatives.md`
     - Define bounded contexts when architecture changes are needed → `05-how-to-define-bounded-contexts.md`
   - Selection criteria:
     - Run when an initiative is selected for delivery or when architecture/bounded-context decisions are required.

3. Customer-Facing Iterations (epic -> stories)

   - Typical activities and how-to:
     - Break epics into user stories → `07-how-to-breakdown-user-stories.md`
     - Refine user stories → `08-how-to-refine-a-user-story.md`
     - Create tasks from stories → `09-how-to-create-tasks.md`
   - Selection criteria:
     - Run when an epic is planned for the next iterations or when stories require refinement before implementation.

4. Sprint Execution (implementation & delivery)
   - Typical activities and how-to:
     - Implement a task → `10-how-to-implement-a-task.md`
     - Commit and push → `11-how-to-commit-and-push.md`
     - Create PR → `12-how-to-create-a-pr.md`
     - Code review → `13-how-to-code-review.md`
   - Selection criteria:
     - Run when a story has been refined and tasks exist. Prefer small, focused changes; add tests per `07-testing-strategy.md`.

## Role-specific activities (ordered by process phase)

These are practical tasks each role commonly performs. The role descriptions come from `.github/chatmodes/` and are ordered by process phase.

- Product Manager (primary in Induction & Strategic phases)

  - Induction: create PRD (`01-how-to-create-PRD.md`), define subdomains (`04-how-to-define-subdomains.md`).
  - Strategic: create/prioritize initiatives (`03-how-to-create-and-prioritize-initiatives.md`), break initiatives into epics (`06-how-to-breakdown-epics.md`).
  - Customer-Facing Iterations: prioritize which epics/stories to refine next; request refinement (`08-how-to-refine-a-user-story.md`).

- Product Engineer (primary in Iterations & Sprint Execution)

  - Iterations: breakdown user stories into tasks (`09-how-to-create-tasks.md`), ensure prerequisites and environment ready.
  - Sprint Execution: implement tasks (`10-how-to-implement-a-task.md`), commit & push (`11-how-to-commit-and-push.md`), open PRs (`12-how-to-create-a-pr.md`), follow code review (`13-how-to-code-review.md`).
  - Cross-cutting: update ADR/adoption docs when implementation affects architecture (see `.pair/tech/adopted/`).

- Staff Engineer (primary in Induction through Sprint Execution for technical oversight)
  - Induction: complete bootstrap checklist if project setup/update is required (`02-how-to-complete-bootstrap-checklist.md`).
  - Strategic: define and validate bounded contexts (`05-how-to-define-bounded-contexts.md`).
  - Sprint Execution: perform code reviews (`13-how-to-code-review.md`), ensure architecture and way-of-working adoptions are followed, update ADR/adoption docs when necessary.

Selection guidance (general):

- Use the backlog and the project-management framework referenced in `adopted_way-of-working.md` to prefer the highest-value eligible activity.
- Always confirm prerequisites before starting an activity (e.g., only implement when story is refined and tasks exist).
- If multiple roles are applicable, the agent should prefer the role that best matches the requested persona (developer prompt usually indicates role). If unclear, ask the developer which role to act as.

## FAQ

- Q: Are there required fields?
  A: No. This is plain Markdown. Agents use headings and prose to extract instructions.

- Q: Will agents run commands automatically?
  A: Yes, when listed. Agents should run checks and attempt automated fixes where safe.
