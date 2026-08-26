# Delivery Metrics

The single home of the **delivery-metric definitions** and the **per-tool query mapping** the `analyze-delivery-metrics` skill applies. This is the Delivery pillar's metrics guideline in the [quality model](quality-model.md) (§2 Delivery pillar, §7 nested taxonomy row _AI metrics / retro_): the model owns the pillar and the taxonomy; this document owns _which metrics, computed how, read from where_ (R9.5). Nothing here duplicates the quality model — it fills in the "which numbers, from which fields" the model forward-references.

**Layering.** The `analyze-delivery-metrics` skill applies these definitions; it holds none of them itself (D17/D21, the same layering `cost-assessment.md` uses for the Cost pillar). Tool selection is adoption-driven: the PM tool and code host resolve through [way-of-working / PM-tool + code-host resolution](../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md), and the fields each one exposes live in that tool's own `*-implementation.md` adapter — the skill routes through the adapter, it never carries provider-specific logic (R2.12). The report is a period panel under `.pair/working/reports/metrics/`, written per the [report-panel convention](../collaboration/working-area.md#report-panels--period-key-and-idempotent-update) — the same one the cost panel follows, so periodic reporting stays one pattern (D14).

**Definitions live here, once.** Every panel links back to this document instead of restating a definition (a metric restated in an artifact drifts from the metric computed by the skill). Adding a metric family is a change to this guideline plus its per-tool mapping row — never a change to the skill.

## The metric set (R9.5)

Fixed trio. Extensions belong to the quality model's taxonomy, not to an ad-hoc panel column.

| Metric | Question it answers | Clock starts | Clock stops | Unit |
| --- | --- | --- | --- | --- |
| **Bug resolution time** | How long does a defect stay open? | bug issue created | bug issue closed | hours (rendered as days above 48h — display only, see the one-unit rule) |
| **PR lead time** | How long does a change take to land? | pull request opened | pull request merged | hours |
| **Adoption** | How much of the delivery actually went through the pair process? | — (ratio, not a duration) | — | % of the period's items |

### Bug resolution time

Population: issues **closed inside the window** that the bug mapping below identifies as defects. Keyed on the close event, not the create event, so a period's figure is stable once the period ends (a create-keyed population keeps changing as old bugs close).

- **Reopened issues**: the **last** close inside the window wins, and the reopen count is reported beside the figure — a bug closed, reopened and closed again is one row with `reopened: N`, never two rows.
- **Still-open bugs** are not in the population (they have no resolution time). Their count is reported as `open at period end`, so a period that resolved nothing cannot read as a period with no defects.
- Wall-clock elapsed time. No working-hours calendar, no weekend subtraction — the number is comparable across teams only if the clock is the same one everywhere.

### PR lead time

Population: pull requests **merged inside the window** (a closed-unmerged PR never shipped, so it has no lead time — it is counted as `closed unmerged` and excluded from the figure, exactly as the cost panel excludes it).

- **PR-open → merge** is the definition (`time to merge`). The first-commit → merge variant (`cycle time`) is deliberately not the headline: the commit timestamp of a rebased or squashed branch is not a reliable clock, and the panel states which definition it used.
- **Draft time is included**, and reported separately as `median draft share` where the tool exposes the draft transition — excluding it would make a PR parked as a draft for a week look like a fast one.
- **Bot-authored PRs are excluded by default** (dependency bumps dominate the population and are not team lead time). The panel names the exclusion and its count; an adoption declaration may include them.

### Adoption

The ratio of the period's delivery that carries the process's own artifacts. Every signal is read from artifacts that already exist — no new instrumentation, no telemetry service:

| Signal | Ratio | Read from |
| --- | --- | --- |
| **Process coverage** | merged PRs carrying the PR template's `Story/Epic:` link ÷ merged PRs | code host PR bodies |
| **Classification coverage** | items carrying a classification matrix or a projected `risk:*`/`cost:*` tag ÷ **items closed inside the window** (the same population the defect metric draws from, defects and non-defects together — an item is "delivered" when the tracker closed it, and nothing else counts) | PM tool item bodies/labels |
| **Review coverage** | merged PRs whose `pair-review` status reported **on the pull request's own head commit** ÷ merged PRs | code host checks/statuses |

A signal whose source is absent (no PR template in use, tag projection not activated, review check not registered) reads **`not available`** for the period — never zero, and never inferred from a proxy: `0%` claims the process was skipped, `not available` says the question cannot be answered from what the tools hold. R9.5's "uptime" reading of this metric is the process's own uptime — how consistently the delivery path was followed — not service availability, which is [observability](quality-monitoring/observability-requirements.md)' concern.

## Aggregation rules

- **Median first, p75 beside it.** Never the mean: both duration metrics are right-skewed, and one three-week PR moves a mean the whole team never experienced. The panel headline carries `median (p75)`.
- **Trend** = this period's median against the **previous window of equal length**, reported as a signed delta plus direction. A period with no comparable predecessor reports `no trend — first period`.
- **What "previous window of equal length" is, per key form** — resolved here, never left to the executor, because calendar units are _not_ equal-length and "same duration" would pick a different window than "the period before this one":
  - `YYYY-MM` ⇒ the **preceding calendar month**, whole (`2026-03` compares against `2026-02`, all 28 days of it — **not** the 31 day-equivalents before 1 March).
  - `YYYY-Wnn` ⇒ the **preceding ISO week**, whole.
  - `YYYY-MM-DD_YYYY-MM-DD` ⇒ the **explicit range** is the only form measured by duration: the equally-long span ending the day before the window starts.
  A calendar key therefore compares like-for-like calendar periods, and the day-count reading of "equal length" applies to the explicit-range form alone. Comparing a 28-day February against 31 day-equivalents is the ambiguity this rule removes: two readers would otherwise publish two different deltas from the same data.
- **One unit across compared periods.** **Hours is the canonical unit**; the `days` rendering above 48h is a **display** convenience, applied to a figure and its trend counterpart **together or not at all**. Two periods in a trend are always rendered in the **same unit** — `47h → 50h`, never `47h → 2.1d`, which reads as a drop.
- **Low sample**: fewer than **5** items in a family ⇒ the panel reports the **raw values and the count**, states `low sample (N < 5)` explicitly, and computes **no trend**. A trend drawn from three PRs is noise presented as a signal; the warning is required wherever the figure appears, not only in a footnote.
- **Zero items** in a family ⇒ `no data for the period` for that family, with the reason. The panel is still written (the panel convention's empty-period rule).
- Figures are derived from the tools' own timestamps at run time; the panel records the **resolved sources** (tool + window + this guideline's revision) as its input provenance, never a wall-clock "generated at" (that would break `same inputs ⇒ same content`).

## Bug detection — adoption-declared mapping

Bug detection is a **mapping**, not a heuristic on issue titles. Resolution order, first hit wins:

1. **Adoption declaration** — an optional `## Delivery Metrics` section in [`tech/way-of-working.md`](../../../adoption/tech/way-of-working.md) naming, in the project's own vocabulary: `bug-label` (label or labels), `bug-type` (native issue/work-item type), and optionally `exclude-authors` (bot accounts) and `adoption-signals` (which of the three adoption ratios apply). Delta-only: declare a key only where it differs from the default below.
2. **Per-tool default** — the tool's native defect marker, per its adapter: a `bug` label or the native `Bug` issue type on GitHub, work-item type `Bug` on Azure Boards, a `Bug` label on Linear, `type: bug` front matter on a filesystem backlog.
3. **Unmapped** — an issue that matches neither is counted as a **generic issue**, never as a bug, and the panel **notes the count**: `N issues unmapped — counted as generic`. A silently bug-counted generic issue inflates the defect figure; a silently dropped one hides work. Both are visible only if the count is stated.

## Per-tool query mapping

What each metric needs, and where each adapter exposes it. The adapter is authoritative for the mechanics (auth, pagination, MCP-vs-CLI path); this table is the field mapping only.

| Input | GitHub ([adapter](../collaboration/project-management-tool/github-implementation.md)) | Azure Boards ([adapter](../collaboration/project-management-tool/azure-devops-implementation.md)) | Linear ([adapter](../collaboration/project-management-tool/linear-implementation.md)) | Filesystem ([adapter](../collaboration/project-management-tool/filesystem-implementation.md)) |
| --- | --- | --- | --- | --- |
| Closed defects in window | issues `state:closed closed:<range>` + the bug mapping (`labels`, issue `type`) | work items `System.WorkItemType = Bug`, `System.ClosedDate` in range | issues filtered by the bug label, `completedAt` in range | backlog files with `type: bug` and a close date in range |
| Issue create/close timestamps | `createdAt` / `closedAt` | `System.CreatedDate` / `System.ClosedDate` | `createdAt` / `completedAt` | front-matter `created` / `closed` |
| Reopen events | issue timeline `reopened` events | state-change history to an active state | issue history state transitions | front-matter `reopened` count, when recorded |
| Merged PRs in window | pull requests `is:merged merged:<range>` | pull requests with `closedDate` + `mergeStatus: succeeded` | attached PR/commit links (Linear tracks issues; PRs come from the code host) | n/a — no PR surface; PR-lead-time reads `not available` |
| PR open/merge timestamps | `createdAt` / `mergedAt`, `isDraft` transitions | `creationDate` / `closedDate` | from the code host | n/a |
| Review-check presence | check runs / statuses on the **PR's own head commit** (`pr.headRefOid`), never the merge commit on the base branch | pipeline/policy evaluation on the PR | from the code host | n/a |

**Code host ≠ PM tool.** PR-side inputs resolve through the **code host** and item-side inputs through the **PM tool** (identical in a single-tool project, distinct in a split one) — the routing table in [way-of-working / PM-tool + code-host resolution](../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) is the single home of that rule. A tool with no PR surface at all (a filesystem backlog with no code host declared) reports PR lead time as `not available` rather than substituting issue timestamps for it.

**A tool not covered in-tree** is reached through an **adoption link** the adoption file supplies, exactly as `cost-assessment.md` extends provider coverage: adding a tool is an adapter/adoption change, never a change to the skill (R2.12).

## Gotchas

- **A window is keyed on the closing event** (close date, merge date). Keying on creation makes a closed period's figures keep moving.
- **Median of a two-item population is the mean of two numbers** — the low-sample rule exists because the statistic stays computable long after it stops being meaningful.
- **The review status lives on the PR's head, not on the merge commit.** Under **squash** (or rebase) merging, the commit that lands on the base branch is a **new commit the review never saw**, so it carries no `pair-review` status and every merged PR would read as unreviewed — a `0%` ratio with the source fully present, which the `not available` clause deliberately does _not_ cover (the source is there; the query was pointed at the wrong commit). Always resolve the PR's own head commit first, then read its statuses. The same trap applies to any per-commit signal read after a squash merge.
- **A period's adoption ratio can only rise to what the tools record.** A team that follows the process perfectly but without the PR template reads low on process coverage — the panel reports the signal, and the reading is "the artifact is missing", not "the process was skipped".
- **Timezones**: window boundaries are resolved in UTC; a locally-defined "week" that shifts the boundary by hours changes the population at the edges. The period key normalizes the window (the panel convention), so the same window always yields the same key and the same file.
- **Bot exclusion cuts both ways**: excluding bots from PR lead time is the default, but a repo whose dependency bumps are merged by humans loses nothing while a repo automating its own releases can under-report volume. The panel states the exclusion count so the reader can judge it.

## Notes

- This guideline owns the **definitions**, the **aggregation rules** and the **field mapping**; `analyze-delivery-metrics` is the skill that applies them (three-layer principle, quality model §1).
- Cadence is the caller's concern (D18): the panel is generated on demand, and an automation loop may drive it periodically. Nothing here schedules anything.
- The panel is an **operational artifact** under `.pair/working/` — never knowledge, never an adoption write, never touched by `pair install`/`pair update` (D14, working-area convention).
