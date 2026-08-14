---
name: setup-pm
description: "Configures the project management tool — creates/wires it up, applies its implementation guide, updates way-of-working, records the decision — whether the tool was already chosen or picked here. Invoke directly to set up a tracker ('configure Jira', 'set up GitHub Projects'). Composed by /bootstrap; /assess-pm delegates here once a tool is picked."
version: 0.6.0
author: Foomakers
---

# /setup-pm — PM Tool Configuration

Configure the project management tool for the current project. Guides the developer through tool selection, applies the implementation guide, updates adoption files, and records the decision.

## Arguments

| Argument | Required | Description                                                                                 |
| -------- | -------- | ------------------------------------------------------------------------------------------- |
| `$tool`  | No       | PM tool to configure (e.g., `github`, `filesystem`). If omitted, presents selection options. |

## Composed Skills

| Skill              | Type       | Required                                                    |
| ------------------ | ---------- | ----------------------------------------------------------- |
| `/record-decision` | Capability | Yes — records PM tool choice as ADL entry + adoption update |

## Algorithm

### Step 1: Detect Existing Configuration

1. **Check**: Read [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md). Does it contain a PM tool configuration (e.g., "Github Projects is adopted" or "Filesystem is adopted" for project management)?
2. **Skip** (not configured): Proceed to Step 2.
3. **Act** (already configured): Present current configuration:

   > PM tool already configured: **[tool name]**.
   > - Current setup: [summary of PM section from way-of-working.md]
   >
   > Options:
   > 1. **Keep current** — no changes needed
   > 2. **Reconfigure** — switch to a different PM tool

   - If **Keep current** → stop, output current state.
   - If **Reconfigure** → proceed to Step 2.

4. **Verify**: Mode is `configure` or `done`.

### Step 2: Select PM Tool

1. **Check**: Is `$tool` provided and valid?
2. **Skip**: If valid `$tool`, proceed to Step 3 with that tool.
3. **Act**: Present PM tool options using the [selection framework](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/README.md):

   > **Select a project management tool:**
   >
   > | Tool | Best For | Implementation Guide |
   > |------|----------|---------------------|
   > | **GitHub Projects** | Teams using GitHub, remote collaboration, any size | Available |
   > | **Filesystem** | Small teams, offline work, high security; tracks items in files — hosts no code, so it needs a separate `code-host` | Available |
   > | **Azure DevOps** | Microsoft ecosystem, enterprise boards + repos | Available |
   > | **Linear** | Modern product teams; backlog only — hosts no code, so it needs a separate `code-host` | Available |
   > | **Other** (Jira, etc.) | Enterprise, complex workflows; Jira likewise hosts no code | No implementation guide yet |
   >
   > Which tool does your team use or want to adopt?

4. **Act**: If developer selects a tool without an implementation guide → **HALT**:

   > No implementation guide available for **[tool name]**. To add support:
   > - Create `guidelines/collaboration/project-management-tool/<tool>-implementation.md`
   > - Follow the structure of existing implementation guides
   >
   > For now, you can manually configure `adoption/tech/way-of-working.md`.

5. **Verify**: Tool selected with available implementation guide.

### Step 3: Apply Implementation Guide

1. **Act**: Read the implementation guide for the selected tool:
   - GitHub: [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)
   - Filesystem: [filesystem-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/filesystem-implementation.md)
   - Azure DevOps: [azure-devops-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/azure-devops-implementation.md)
   - Linear: [linear-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/linear-implementation.md)

2. **Act**: Walk the developer through the setup steps from the implementation guide:
   - For **GitHub Projects**: project creation, board configuration, label setup, automation rules, MCP integration
   - For **Filesystem**: directory structure creation, status tracking files, workflow templates — and the `code-host` declaration in `## Git Workflow`, because a filesystem tracker hosts no repositories
   - For **Azure DevOps**: organization/project defaults, work item type mapping, board columns, `az` authentication
   - For **Linear**: team + project creation, type labels, estimate scale, access path (MCP or GraphQL) — and the `code-host` declaration in `## Git Workflow`, because Linear hosts no repositories

3. **Act**: Gather project-specific details needed for configuration:
   - Project/organization name
   - Board columns and workflow methodology (Kanban, Scrum, etc.)
   - Label taxonomy
   - Automation preferences

4. **Verify**: PM tool is configured and accessible.

### Step 4: Update Way-of-Working

1. **Check**: Read current [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md).
2. **Act**: Add or update the PM tool section with:
   - Tool name and version/tier
   - Workflow methodology (Kanban, Scrum, etc.)
   - Project identifier (e.g., GitHub org/project name, filesystem path)
   - Access method (e.g., MCP, CLI, direct)
   - Reference to implementation guide
3. **Act — `## Git Workflow` (only when needed)**: if the selected PM tool **hosts no code** — `linear`, `jira`, **`filesystem`** (it tracks item state in files and has no repositories, branches or PRs) — ask which tool hosts the repositories and write `code-host` (+ `base-branch`) in the `## Git Workflow` section. When the PM tool *is* the code host (GitHub Projects, Azure DevOps), **write nothing** — omitted means "same tool", the zero-configuration default. See [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) for the full hosts-code / hosts-no-code split.
4. **Act — `## Assignment` (always ask)**: ask **who items and pull requests default to**, and write `## Assignment` → `default-assignee` in way-of-working.md. This is the one adoption key that has no safe inferred value: skills never fall back to the authenticated user (an agent under a bot token would assign everything to the bot), so **nothing declared here means every item and every PR this project files is written unassigned** — and most boards are read filtered by assignee, so those items are invisible on the board while open and green. When step 3 just declared a separate `code-host`, also ask whether that host knows the same person by a **different identifier** and write `code-host-assignee` when it does. Already declared ⇒ confirm it and leave it byte-identical (idempotent). Declined ⇒ write nothing and say what it costs. Schema and cascade: [Assignee resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md#assignee-resolution).
5. **Verify**: Way-of-working reflects current PM configuration, `code-host` is declared iff the PM tool cannot host the code, and `## Assignment` either declares `default-assignee` or the developer was told, in so many words, that items and PRs will be filed unassigned.

### Step 5: Record Decision

1. **Act**: Compose `/record-decision` with:
   - `$type`: `non-architectural`
   - `$topic`: `pm-tool-choice`
   - `$summary`: "[Tool] adopted for project management with [methodology] workflow"

2. **Verify**: ADL entry created at `adoption/decision-log/YYYY-MM-DD-pm-tool-choice.md` and adoption files updated.

## Output Format

```text
PM CONFIGURED:
├── Tool:       [tool name]
├── Methodology: [Kanban | Scrum | etc.]
├── Project:    [project identifier]
├── Access:     [MCP | CLI | filesystem]
├── Adoption:   [way-of-working.md updated]
├── Assignment: [default-assignee: <identifier> (+ code-host-assignee: <identifier>) | none declared — items and PRs will be filed unassigned]
├── Decision:   [ADL entry path]
└── Status:     [Configured | Already configured (unchanged) | Reconfigured]
```

## Composition Interface

When composed by `/bootstrap`:

- **Input**: `/bootstrap` reaches PM configuration phase and invokes `/setup-pm` (optionally with `$tool` if developer pre-selected).
- **Output**: Returns tool name, configuration status, and ADL entry path.
- `/bootstrap` includes the adoption and ADL changes in the next commit.

When invoked **independently**:

- Interactive: full Step 1-5 flow. Developer commits changes when satisfied.

## Edge Cases

- **PM tool already configured + reconfigure**: Old configuration is replaced, not appended. The new ADL entry references the previous decision if one exists.
- **No MCP connection for GitHub**: Warn that GitHub Projects requires MCP or CLI access. Offer to configure the adoption file manually and validate connectivity later.
- **Multiple PM tools**: This skill configures exactly one PM tool per project — no dual-tool configuration. If the developer needs to track a second tool informally, suggest they note a primary + secondary convention in way-of-working themselves (an informal record, not something this skill sets up or persists).

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (adoption file missing → the skill still runs, creates it) for the standard scenarios. **This skill is the documented exception to the generic [record-decision contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md)**: it writes `way-of-working.md` itself in Step 4, before composing `/record-decision` in Step 5 — so a missing `/record-decision` does not mean "nothing persisted," only that the ADL entry is skipped. Additional cases:

- If [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) doesn't exist, create it with PM section as initial content. Warn: "Created way-of-working.md — this appears to be a new project."
- If implementation guide not found for selected tool, HALT with contribution instructions (Step 2.4).
- If `/record-decision` is not installed, the way-of-working.md write has already succeeded (Step 4) — only the ADL entry (Step 5) is skipped. Warn: "Decision not recorded — /record-decision not installed. Please manually document the PM tool choice."

## Notes

- Supported tools with implementation guides: **GitHub Projects**, **Filesystem**.
- The [selection framework](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) provides decision matrix and cost-benefit analysis for tool selection.
- This skill modifies: `adoption/tech/way-of-working.md` and creates an ADL entry via `/record-decision`.
- PM tool configuration is a project-level decision — it applies to all team members and workflows.
