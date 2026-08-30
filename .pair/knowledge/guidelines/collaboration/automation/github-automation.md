# GitHub Automation

## Overview

Comprehensive GitHub automation strategies for project management workflows, development processes, and tool integrations using GitHub Actions, MCP server integration, and workflow orchestration to improve team efficiency and consistency.

## Automation Components

### Status Synchronization

#### Issue to Project Board Updates

- Automatic project board updates based on issue status changes
- Parent-child relationship status propagation
- Cross-repository status synchronization for multi-repo projects

#### Pull Request Integration

- Automatic status updates when pull requests are created, reviewed, or merged
- Issue linking and closure automation based on PR merge status
- Branch workflow automation with naming conventions

#### Hierarchical Status Management

- Initiative → Epic → User Story → Task status cascading
- Bottom-up status propagation rules
- Parent completion validation based on child item completion

### Development Workflow Automation

#### Branch Management

- Automated branch creation from GitHub issues
- Branch naming convention enforcement
- Branch protection and merge policies

#### Code Review Automation

- Automated reviewer assignment based on code ownership
- Review workflow orchestration and notification management
- Code review checklist automation and validation

#### Deployment Integration

- Automated deployment triggers based on merge status
- Environment-specific deployment workflows
- Rollback automation and monitoring integration

### Project Management Integration

#### Sprint Planning Automation

- Automated sprint creation and milestone management
- Issue assignment and capacity planning integration
- Velocity tracking and sprint metrics collection

#### Progress Reporting

- Automated progress reports and dashboard updates
- Stakeholder notification and communication automation
- Metrics collection and analysis for continuous improvement

#### Notification Management

- Smart notification filtering and escalation procedures
- Team-specific notification preferences and routing
- Context-aware notification content and timing

## MCP Server Integration

### Authentication and Permissions

#### Server Setup

- MCP server configuration for GitHub Projects integration
- Authentication token management and security protocols
- Permission validation and access control verification

#### API Integration

- GitHub API access through MCP server endpoints
- Rate limiting and error handling for API operations
- Retry logic and failover mechanisms for reliability

### Automation Workflows

#### Issue Management

- Create, update, and link issues through MCP commands
- Label management and categorization automation
- Comment and documentation automation for audit trails

#### Project Board Operations

- Board column management and status synchronization
- Item movement and workflow state transitions
- Custom field updates and metadata management

#### Reporting and Analytics

- Automated metrics collection and dashboard updates
- Performance tracking and trend analysis
- Custom report generation and stakeholder communication

## GitHub Actions Workflows

### Workflow Triggers

#### Issue-Based Triggers

```yaml
on:
  issues:
    types: [opened, edited, closed, assigned]
  issue_comment:
    types: [created, edited]
```

#### Pull Request Triggers

```yaml
on:
  pull_request:
    types: [opened, synchronize, closed]
  pull_request_review:
    types: [submitted]
```

#### Schedule-Based Triggers

```yaml
on:
  schedule:
    - cron: '0 9 * * MON' # Weekly reports
    - cron: '0 18 * * *' # Daily summaries
```

### Automation Examples

#### Status Synchronization Workflow

```yaml
name: Project Status Sync
on:
  issues:
    types: [closed, reopened]

jobs:
  sync-status:
    runs-on: ubuntu-latest
    steps:
      - name: Update Parent Epic Status
        uses: ./.github/actions/sync-hierarchy
        with:
          issue-number: ${{ github.event.issue.number }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Automated Branch Creation

```yaml
name: Create Feature Branch
on:
  issue_comment:
    types: [created]

jobs:
  create-branch:
    if: contains(github.event.comment.body, '/create-branch')
    runs-on: ubuntu-latest
    steps:
      - name: Extract Issue Info
        id: issue-info
        run: |
          echo "branch-name=feature/issue-${{ github.event.issue.number }}" >> $GITHUB_OUTPUT

      - name: Create Branch
        uses: ./.github/actions/create-branch
        with:
          branch-name: ${{ steps.issue-info.outputs.branch-name }}
          base-branch: main
```

### Advanced Automation Patterns

#### Multi-Repository Coordination

- Cross-repository issue linking and status synchronization
- Dependency tracking and blocking issue management
- Coordinated release and deployment automation

#### Custom Workflow Integration

- Team-specific workflow automation and customization
- Integration with external tools and notification systems
- Advanced reporting and analytics automation

## Tag-Driven Dispatch — the reference trigger adapter

The **trigger** for tag-driven workflows: the thin, host-specific piece that turns "a label was added to an issue" into one call to pair's entry point. Everything it decides is decided here; everything it *routes* is decided by `## Workflows` in `tech/automation.md` (schema: [automation-policy.md](automation-policy.md)). The adapter is deliberately small — three steps and no logic of its own — because that is what keeps every host on the same routing core.

### The workflow

```yaml
name: pair dispatch
on:
  issues:
    types: [labeled]

# One in-flight job per issue. On EPHEMERAL runners this group IS the cross-job guard, and
# `cancel-in-progress: false` is what makes it one: every job checks out a fresh workspace,
# so the per-card lock `pair run` takes lives in a working area no other job can see, and it
# can never observe a holder from another runner (ADR-024: the lock is filesystem-local).
# A second trigger declared OUTSIDE this group — a `workflow_dispatch` button, an
# `issue_comment` job — therefore starts a second agent on the same card, the same branch
# and the same PR. Put every path that dispatches a card into THIS group.
# The per-card lock is the guard within ONE working area: a persistent daemon box, where the
# bursts it stops are real and the host has no concurrency group at all.
concurrency:
  group: pair-dispatch-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  dispatch:
    runs-on: ubuntu-latest
    # The credentials live HERE, at the adapter — the narrowest set that lets it read the
    # issue it was handed and post one comment on it. `pair run` itself is given none.
    permissions:
      issues: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Dispatch the card
        id: dispatch
        # DECLARED, not defaulted. GitHub's implicit shell is `bash -e {0}` — WITHOUT
        # `pipefail` — so the pipeline below would report `tee`'s status and a HALT inside
        # `pair run` (an uninstalled workflow, an undecidable multi-tag card) would land as a
        # green tick. `shell: bash` is what makes GitHub run the step with `-eo pipefail`.
        shell: bash
        env:
          # The labels the trigger ALREADY observed — passed as data, never re-fetched. An
          # adapter that queries the API for them is the tracker client the driver exists
          # without. Through the environment, not string-interpolated into the command line.
          CARD_TAGS: ${{ join(github.event.issue.labels.*.name, ',') }}
          CARD: ${{ github.event.issue.number }}
        run: |
          pair run --card "$CARD" --card-tags "$CARD_TAGS" --autonomous \
            | tee dispatch.log

      - name: Record the run on the card
        if: always()
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
          CARD: ${{ github.event.issue.number }}
        run: |
          # The driver PRINTS this line and never posts it: posting is the adapter's job,
          # because the adapter is what holds a tracker token. No line ⇒ nothing was
          # dispatched (untagged, unmapped or ineligible card) ⇒ nothing to comment.
          record="$(grep '^DISPATCH-RECORD:' dispatch.log || true)"
          # `if`, not `[ -n "$record" ] && …`: under `-e` a trailing compound whose test is
          # false exits 1, so the silent case — the untagged issue this feature promises
          # costs nothing — would fail the step and notify a human on every unmapped label
          # edit on the board.
          if [ -n "$record" ]; then
            gh issue comment "$CARD" --body "$record"
          fi
```

### What the adapter does and does not decide

| Question | Answered by |
| --- | --- |
| Did anything happen on a card? | the host trigger (`types: [labeled]`) |
| Which workflow runs on it? | `## Workflows` in `tech/automation.md` — never the adapter, never a job condition |
| May this card run at all? | `## Eligibility`, applied by the dispatcher *before* routing |
| Is another run already on this card? | the per-card lock inside `pair run` |
| Who tells the humans? | the adapter, by posting the `DISPATCH-RECORD:` line |

**Only a run START is ever posted on the card.** `DISPATCH-RECORD:` is emitted for the `start` event and for nothing else — a skip and an end are appended to the audit file only. That is deliberate and it is the whole reason the comment step needs no filter of its own: a board where every unmapped label edit posted a "nothing happened" comment would be unreadable within a day, and an `end` comment would double every run's noise for a fact the audit trail already holds. An adapter that wants the end on the card reads it from `## Audit Location`; it must not re-derive it from the exit status.

A job `if:` that pre-filters on a label is the one thing worth resisting: it duplicates the mapping in a second place, in a language the dispatcher cannot read, and the two drift on the day someone renames a tag in adoption. Let every labeled event through and let the routing core skip what it should skip — a skip is cheap, reported, and appended to the audit trail.

### Untagged is not a case the adapter has to handle

An issue carrying no mapped tag **runs nothing**: the dispatcher reports the skip and exits `0`, and with no `DISPATCH-RECORD:` line the comment step posts nothing. That includes the **unlabelled** issue, where `join(github.event.issue.labels.*.name, ',')` renders an empty string: `--card-tags` reads an empty value as the observation "this card carries no labels", so the adapter needs no guard clause and no conditional call — passing what the trigger saw is always correct. That is the opt-in boundary of the whole feature, and it lives in the routing core precisely so that no adapter can widen it by accident. The same holds when `tech/automation.md` declares no `## Workflows` section at all — the run reports `no mapping declared` and exits cleanly.

### Before wiring the trigger

- **Run it once by hand**, on a card you tagged deliberately: `pair run --card <id> --card-tags "<labels>" --dry-run` prints the route, the perimeter and the policy, and spawns nothing.
- **Scope the token to the repository the cards live in.** The adapter can only ever post where its token reaches; the engine credentials the run itself needs are a separate, and usually much broader, concern.
- **Watch the audit file** (`## Audit Location`) for the first few cycles: every start, skip and end is there, including the ones the card never shows.
- **Check the mapping resolves before the first trigger fires.** A `## Workflows` entry naming a workflow nobody installed — or one the dispatcher cannot hand the card to, i.e. anything outside the [catalog](automation-policy.md#the-workflows-a-mapping-can-name) — HALTs the dispatch *before* eligibility and routing, so it stops **every** card on the board, not only cards carrying that tag. That is the intended blast radius — a broken mapping is broken for everyone, and finding out only on the one card that happens to carry the tag would make the failure depend on which trigger fired first — but it means the dry run above is a check on the whole board, not on one card.
- **Know how to clear a stale lock.** The per-card lock is a directory (`<working_path>/automation/locks/<card>/`) with no timeout and nothing to reap it: a run killed by SIGKILL, an OOM kill or a job timeout leaves it behind, and every later trigger on that card then skips with `run-in-progress` and exits `0` — automation silently off for that one card. The skip line prints the directory and how long it has been held; when no run is alive, `rm -rf` that directory to clear it. On ephemeral runners the workspace is discarded with the job, so this is a **persistent daemon** concern.

## Implementation Guidelines

### Setup Process

1. **MCP Server Configuration**

   - Install and configure MCP server for GitHub integration
   - Set up authentication tokens and permission validation
   - Test connectivity and basic operations

2. **GitHub Actions Setup**

   - Create workflow files in `.github/workflows/` directory
   - Configure secrets and environment variables
   - Test workflows with sample issues and pull requests

3. **Project Configuration**
   - Set up GitHub Projects boards and custom fields
   - Configure labels and issue templates
   - Establish naming conventions and workflow rules

### Best Practices

#### Error Handling and Monitoring

- Implement comprehensive error logging and notification
- Set up monitoring for automation failures and performance issues
- Create fallback procedures for manual intervention when needed

#### Security and Compliance

- Use principle of least privilege for automation tokens
- Implement audit logging for all automated actions
- Regular review and rotation of authentication credentials

#### Performance Optimization

- Minimize API calls and implement efficient batching
- Use caching strategies for frequently accessed data
- Monitor and optimize workflow execution times

### Troubleshooting

#### Common Issues

- Permission and authentication failures
- Rate limiting and API quota management
- Workflow trigger conflicts and execution order

#### Debugging Strategies

- Enable detailed logging for workflow execution
- Use GitHub Actions debugging features
- Implement step-by-step validation and checkpoints

#### Maintenance Procedures

- Regular review and update of automation workflows
- Performance monitoring and optimization
- Documentation updates and team training

## Integration with Development Workflow

### Code Review Integration

#### Automated Review Assignment

- Code ownership-based reviewer assignment
- Workload balancing and expertise matching
- Escalation procedures for review delays

#### Review Quality Assurance

- Automated checklist validation and compliance checking
- Integration with code quality tools and metrics
- Review completion tracking and reporting

### Release Management

#### Automated Release Workflows

- Version tagging and release note generation
- Deployment pipeline integration and coordination
- Rollback procedures and incident response automation

#### Quality Gates

- Automated testing and validation checkpoints
- Approval workflows and sign-off procedures
- Compliance verification and audit trail management

This GitHub automation framework provides comprehensive automation capabilities that integrate seamlessly with development workflows while maintaining visibility, control, and reliability for team collaboration and project management.Automation

## Overview

This document outlines automation strategies for GitHub-based collaboration workflows.

## TODO

This document needs to be completed with GitHub automation guidelines.
