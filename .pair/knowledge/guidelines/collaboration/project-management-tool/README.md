# Project Management Tool Framework

## Overview

Systematic project management tool orchestration through platform evaluation, implementation optimization, and workflow integration that enables teams to select, adopt, and maximize the effectiveness of project management solutions across diverse organizational contexts and project requirements.

**PM tool ≠ code host.** These guides cover the tool that holds the **backlog**. The tool that holds the **code** (branches, pull requests, reviews) is the *code host*, and it is the same tool by default — a project only declares `code-host` in `way-of-working.md` → `## Git Workflow` when the two differ (Linear + GitHub being the reference case). Which field each operation reads is defined once, in [way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).

## Scope

This framework covers:

- Project management tool selection, setup, and implementation guidance
- GitHub Projects, Azure DevOps, Linear, and filesystem-based project management implementations
- Tool-specific workflow configuration and optimization strategies
- Integration patterns with development tools and communication platforms
- Migration strategies and tool evaluation frameworks
- Cross-topic integration with other collaboration areas

## Out of Scope

This framework does not cover:

- Development tool selection (covered in technical standards)
- Communication platform selection (covered in communication protocols)
- Code repository management (covered in technical standards)
- Time tracking and billing tools

## Directory Contents

### State Model

**[canonical-states.md](canonical-states.md)** - The 5 canonical macrostates (`Draft`, `Ready`, `In Progress`, `Review`, `Done`), their semantics, and the n-m `state-mapping` schema skills use to resolve board-specific state names — the default is canonical names, adoption carries only the delta

**[definition-of-ready-and-done.md](definition-of-ready-and-done.md)** - Canonical Definition of Ready (R3.8, 6 criteria) and Definition of Done (R3.9, 4 criteria + per-tier hooks) — companion to canonical-states.md, the source `/pair-capability-verify-done` and the user-story template read

**[pr-states.md](pr-states.md)** - The PR state flow (gate ≠ review): the 3 PR states (`to-be-reviewed` → `ready-to-merge` / `not-approved`), the synthesis of gates × review verdict × tier × explicit approval, and the required `pair-review` / `pair-explicit-approval` checks that make merge blocking mechanical — the pull-request companion to canonical-states.md

### Implementation Guides

**[filesystem-implementation.md](filesystem-implementation.md)** - Complete setup and usage guide for filesystem-based project management

- Local markdown file management
- Directory-based status tracking
- pair integration workflows
- Step-by-step implementation instructions

**[github-implementation.md](github-implementation.md)** - Complete setup and usage guide for GitHub Projects-based project management

- MCP GitHub Server integration
- Automation and workflow setup
- Cross-topic navigation and integration
- Advanced configuration options

**[azure-devops-implementation.md](azure-devops-implementation.md)** - Complete setup and usage guide for Azure DevOps (Boards)-based project management

- Azure CLI (`az boards`/`az repos`) integration
- Work item hierarchy mapping (Initiative→Epic, Epic→Feature, Story→PBI, Task→Task)
- State mapping example for Azure Boards columns
- Pull request and merge workflow

**[linear-implementation.md](linear-implementation.md)** - Complete setup and usage guide for Linear-based project management

- Two access paths documented (Linear MCP Server, GraphQL API) — adoption picks one
- Issue hierarchy mapping (labels-as-types + parent/sub-issue), estimates, and the default state mapping
- The **reference split configuration**: Linear hosts no code, so PR/review work routes to a declared `code-host` and the two tools are linked by the `Refs: <issue-id>` convention

### Quick Reference

All implementation guides include:

- ✅ Prerequisites and setup steps
- ✅ Cross-topic integration with other collaboration areas
- ✅ Workflow configuration and optimization
- ✅ Best practices and troubleshooting
- ✅ Team collaboration patterns
- ✅ Development workflow integration

### Adapter Contract — Required Coverage

Every implementation guide in this directory is an **adapter**: skills stay tool-agnostic and delegate tool-specific mechanics here. An adapter that omits one of the following is incomplete, and the omission surfaces as an item that exists, is open, is green — and is invisible to the team.

Why this coverage lives in the **adapters** and not in the skills, and why the contract is gate-enforced rather than advisory, is recorded as an ADL in the adopting project's decision log — in this repository, `.pair/adoption/decision-log/2026-07-31-pm-adapter-visibility-contract.md`. (Referenced as a path, not a link: the decision log is per-project `add`-behaviour content, so the file does not exist in a freshly seeded install.)

**Membership and assignee are independent, and both are required for visibility** — assigned but not a member is invisible on the board; a member but unassigned is invisible in the assignee-filtered view the team reads. Fixing one does not fix the other.

Every adapter therefore carries a **level-3** section headed **`### Item Visibility: Membership and Assignee`** — level 3 exactly, because the conformance guard locates the section by that heading level and reads only its body. Documenting:

1. **Board membership semantics** — whether membership in the tracked view is **explicit** (a separate call, e.g. GitHub Projects' `addProjectV2ItemById`, because an issue and a project item are distinct objects) or **implicit** (creating the item is its membership, e.g. Azure Boards' team project, or the file's location in a filesystem backlog). State it either way, in the words `membership is explicit` / `membership is implicit`: **silence is what makes an agent invent an add-item step that does not exist for that tool**, or skip one that does. Write it in the pinned sentence form — **`Board membership is explicit …`** or **`Board membership is implicit …`** — the `Board` prefix included: the guard pins that whole phrase for every adapter whose semantics it knows, so `membership is implicit` without it reddens the gate.
2. **The assignee mechanic** — the concrete field/flag that sets the assignee `as part of the create, never as a follow-up step`, per the Assignment rule in the project's `way-of-working.md`.
3. **The unresolvable-assignee behaviour** — `if the assignee cannot be resolved`, report it and `never drop it silently`. Dropping it reproduces the invisibility the section exists to remove.
4. **The status-write precondition** — for explicit-membership tools, that membership precedes the state write, plus what happens when the item lookup returns nothing (an explicit branch, never an unhandled empty value and never a silently skipped board write reported as success).
5. **Implicit membership that can still miss the read view** — "implicit" answers *how* membership happens, not *whether the item is visible*. Where creating the item makes it a member and it can still land outside the view the team reads (Azure Boards: an **area path** outside the team's configured areas; Linear: a project-scoped view the issue was never added to), name the **field** that decides it AND carry that field on the create recipe, not only in prose. An adapter that stops at "membership is implicit" hands an agent a create that satisfies the contract and produces an invisible item — the exact failure the contract exists to prevent.

Conformance coverage is **data-driven over the `*-implementation.md` files present**, in both the dataset and the generated root mirror — see `packages/knowledge-hub/src/conformance/pm-tool-adapter-contract.test.ts`. Adding an adapter therefore enrols it in the contract automatically; **no adapter count is asserted anywhere**, and an omission fails the gate instead of being discovered in production.

## Tool Selection Decision Framework

### Decision Matrix

| Criteria           | GitHub Projects | Filesystem | Azure DevOps | Linear    | Jira      |
| ------------------ | --------------- | ---------- | ------------ | --------- | --------- |
| **Team Size**      | 1-50+           | 1-10       | 10-500+      | 5-50      | 10-500+   |
| **Complexity**     | Medium-High     | Low-Medium | High         | Medium    | High      |
| **Integration**    | Excellent       | Basic      | Excellent    | Good      | Excellent |
| **Cost**           | Free-Paid       | Free       | Paid         | Paid      | Paid      |
| **Learning Curve** | Medium          | Low        | High         | Low       | High      |
| **Customization**  | Medium          | High       | High         | Medium    | High      |
| **Reporting**      | Basic           | Custom     | Advanced     | Good      | Advanced  |
| **Mobile Support** | Good            | None       | Good         | Excellent | Good      |

### Tool Selection Decision Tree

```text
Start: What is your team context?

├── Team size < 5 people?
│   ├── Simple workflow needs?
│   │   └── → Use Filesystem-based approach
│   └── Remote team collaboration needed?
│       └── → Use GitHub Projects
│
├── Team size 5-15 people?
│   ├── GitHub-centric development?
│   │   └── → Use GitHub Projects
│   ├── Microsoft ecosystem?
│   │   └── → Consider Azure DevOps
│   └── Modern startup environment?
│       └── → Consider Linear
│
├── Team size 15+ people?
│   ├── Enterprise requirements?
│   │   ├── Microsoft shop?
│   │   │   └── → Use Azure DevOps
│   │   └── Atlassian ecosystem?
│   │       └── → Use Jira
│   └── GitHub-centric large team?
│       └── → Use GitHub Projects (Enterprise)
│
└── Complex compliance/audit needs?
    └── → Use Jira or Azure DevOps
```

### Cost-Benefit Analysis

#### GitHub Projects

#### Benefits:

- Seamless integration with GitHub development workflow
- Free for public repositories, affordable for private
- Easy adoption for teams already using GitHub
- Good automation and workflow integration

#### Costs:

- Limited advanced project management features
- Basic reporting and analytics capabilities
- Dependency on GitHub ecosystem
- May need additional tools for complex projects

**Best ROI:** Teams primarily using GitHub for development

#### Filesystem-based

#### Benefits:

- Complete control and customization
- No PM-tool dependency or cost (a `code-host` is still declared — filesystem hosts no pull requests)
- High privacy and security
- Offline accessibility

#### Costs:

- No collaboration features
- Manual maintenance and updates
- Limited scalability for larger teams
- No built-in automation or integrations

**Best ROI:** Small teams with simple needs or high security requirements

#### Azure DevOps

#### Benefits:

- Comprehensive project management and development tools
- Excellent integration with Microsoft ecosystem
- Advanced reporting and analytics
- Enterprise-grade features and security

#### Costs:

- Higher licensing costs for larger teams
- Complex setup and configuration
- Learning curve for non-Microsoft teams
- Potential over-engineering for simple projects

**Best ROI:** Microsoft-centric enterprise teams

#### Linear

#### Benefits:

- Modern, fast, and intuitive interface
- Good integration with development tools
- Strong focus on developer productivity
- Excellent mobile support

#### Costs:

- Subscription-based pricing
- Limited customization options
- Newer platform with evolving features
- May lack some enterprise features

**Best ROI:** Modern development teams prioritizing user experience

#### Jira

#### Benefits:

- Comprehensive project management capabilities
- Extensive customization and workflow options
- Strong reporting and analytics
- Large ecosystem of integrations

#### Costs:

- Complex setup and administration
- High licensing costs for larger teams
- Steep learning curve
- Can become slow and cumbersome

**Best ROI:** Large teams with complex project management needs

### Context-Based Recommendations

#### Small Teams (1-5 people)

**Primary Choice:** Filesystem or GitHub Projects

- **Filesystem for:** High security, simple workflows, offline work
- **GitHub Projects for:** Remote collaboration, GitHub-centric development

#### Medium Teams (5-15 people)

**Primary Choice:** GitHub Projects or Linear

- **GitHub Projects for:** GitHub-centric development, cost-conscious teams
- **Linear for:** Modern development teams, mobile-first workflows

#### Large Teams (15+ people)

**Primary Choice:** GitHub Projects (Enterprise), Azure DevOps, or Jira

- **GitHub Projects for:** GitHub-centric large teams
- **Azure DevOps for:** Microsoft ecosystem, enterprise requirements
- **Jira for:** Complex project management, Atlassian ecosystem

#### Enterprise Requirements

**Primary Choice:** Azure DevOps or Jira

- **Azure DevOps for:** Microsoft shops, integrated DevOps workflows
- **Jira for:** Complex workflows, extensive customization needs

### Implementation Guidance

#### Quick Start Process:

1. **Assess Context:** Use decision matrix and tree above
2. **Select Tool:** Choose based on team size, needs, and ecosystem
3. **Pilot Implementation:** Start with small team or project
4. **Configure Workflows:** Adapt tool to team methodology
5. **Train Team:** Provide adequate training and support
6. **Iterate and Improve:** Regular assessment and optimization

#### Migration Strategies:

- **Gradual Migration:** Phase transition over multiple sprints
- **Parallel Operation:** Run old and new systems simultaneously
- **Data Migration:** Plan for historical data preservation
- **Training Program:** Comprehensive team training and support

## Documentation Structure

This framework has been optimized for clarity and usability:

### Consolidated Implementation Guides

- **Previous Structure**: Separate tool setup guides and implementation guides
- **Current Structure**: Unified comprehensive implementation guides
- **Benefits**: Reduced duplication, single source of truth, better cross-topic integration

### Cross-Topic Integration

Every implementation guide includes comprehensive cross-topic navigation to:

- **Issue Management**: Integration with issue tracking workflows
- **Project Tracking**: Progress monitoring and reporting approaches
- **Automation**: Workflow automation and AI-assisted management
- **Board Management**: Board configuration and optimization
- **Communication**: Team communication and collaboration patterns
- **Estimation**: Effort estimation and velocity tracking
- **Methodology**: Integration with Scrum, Kanban, and other methodologies

### Implementation Support

Each guide provides:

- **Step-by-step setup**: Detailed implementation instructions
- **Workflow integration**: Development and collaboration patterns
- **Best practices**: Proven approaches and common pitfalls
- **Troubleshooting**: Problem resolution and support resources
- **Team guidance**: Collaboration and adoption strategies

---

**Skill**: Use `/pair-capability-assess-pm` to evaluate and adopt a PM tool from these guidelines via the resolution cascade. Use `/pair-capability-setup-pm` for tool configuration.

*This framework provides comprehensive guidance for selecting and implementing project management tools that integrate seamlessly with development workflows and team collaboration patterns.*
