---
name: assess-cost
description: "Assesses the financial exposure of a change as a chromatic cost class (green/yellow/orange/red) against the KB cost-signal catalog resolved through the project's stack/architecture/infrastructure adoption, in two modes: `$mode: classify` — the review/refinement-time class, output-only, emitted as the cost dimension of the classification matrix (1-line verdict + collapsed details, D22) for /classify and /review to consume; `$mode: report` — bidirectional cost monitoring over a period's closed PRs (predicted class vs. real signals, drift flagged, deploy-match when telemetry exists), rendered as a consolidated panel written to .pair/working/reports/cost/, idempotent by period key. Multi-provider by construction: adding a provider touches adoption/KB only, never this skill."
version: 0.2.0
author: Foomakers
---

# /assess-cost — Cost Assessment

Assess the financial exposure of a change in two modes, both resolved from the same rule set — the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) (§2 Cost pillar, §3.3 Cost class) plus the [cost-assessment guideline](../../../.pair/knowledge/guidelines/quality-assurance/cost-assessment.md), the single home of the cost-signal catalog, the general + provider-specific heuristics (AWS first), and the cost gotchas:

- **`classify`** (default) — the chromatic **cost class** (`green` / `yellow` / `orange` / `red`) of the cost signals present in the diff (or, at refinement, the story scope). Output-only.
- **`report`** — **bidirectional cost monitoring** over a period: each closed PR's refinement-time _predicted_ class against its _real_/observed cost signals, drift flagged, rendered as a consolidated panel in the reports working area.

**Classification mode writes no files.** It emits the cost dimension of the classification matrix and nothing else: it **creates no backlog items and never blocks** a PR or merge (it has no such authority — the merge decision stays with `/review`, exactly as the `assess-security` sibling reports a verdict but never blocks). The cost class it computes is consumed by `/classify` and `/review`; the skill never interprets or acts on its own verdict. Report mode is the skill's only writer, and it writes exactly one file: the period panel (Step 11) — no adoption content, no issues, ever.

**Provider-agnostic core (R2.13).** No provider names are hardcoded in this skill. Which heuristics apply is selected by the project's `tech-stack.md` / `architecture.md` / `infrastructure.md` adoption files (Q3); the catalog and per-provider heuristics live in the guideline (D17/D21). Adding a provider is an adoption/KB change (a new per-provider section or an adoption link), never a change to this skill.

## Arguments

| Argument  | Required | Description                                                                                                                              |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `$mode`   | No       | `classify` — class of one diff/story (output-only). `report` — period cost monitoring panel. Auto-detected: a diff/story in context (i.e. invoked by `/review` or `/classify`) → `classify`; a `$period` given, or no surface in context → `report`. |
| `$diff`   | No       | Classification mode. The PR/branch diff to classify. Default when invoked by `/review` or against a branch: the current diff.            |
| `$story`  | No       | Classification mode. A story/issue to classify from its declared scope instead of a diff — the refinement-time (shift-left) path, mirroring the risk matrix built twice. |
| `$scope`  | No       | Classification mode. Area/package to scope the scan (default: the whole diff/story). Package-scoped only — never narrows the rule set, only the surface scanned. |
| `$period` | No       | Report mode. The monitored window as a period key — `YYYY-MM`, `YYYY-Wnn`, or `YYYY-MM-DD_YYYY-MM-DD` (default: the current calendar month). |
| `$output` | No       | Report mode. Directory the panel is written to. Default: `.pair/working/reports/cost/` (D14 — report path override).                      |

`$diff` and `$story` are mutually exclusive inputs; exactly one surface is classified per `classify` run. Neither provided → auto-detect: a PR/diff in context (i.e. invoked by `/review`) → `$diff`; a story in context (i.e. invoked by `/refine-story`/`/classify` in refinement) → `$story`.

## Rule Set

Every rule resolves through the standard **Argument > Adoption > KB default** cascade of the quality model (§quality-model.md resolution order):

1. **KB default** — [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §3.3 (class = highest detected signal; class token `cost:green|yellow|orange|red`) + the [cost-assessment guideline](../../../.pair/knowledge/guidelines/quality-assurance/cost-assessment.md) (the signal catalog, the general heuristics, the per-provider heuristics starting with AWS, the gotchas).
2. **Provider selection (adoption)** — read `tech-stack.md`, `architecture.md`, `infrastructure.md`: the declared cloud/provider (e.g. AWS) selects which per-provider heuristics in the guideline apply. A provider the guideline does not cover in-tree is reached via an **adoption link** the adoption file supplies (fallback/extension — no skill change, Q3).
3. **Project delta (adoption)** — `tech/risk-matrix.md` `## Overrides` may tune cost thresholds (e.g. reclassify a shared path); absent ⇒ KB defaults apply completely (D21).

A missing/malformed adoption file is treated as absent: warn and fall back to KB defaults (D21) — never HALT on adoption absence.

## Algorithm

### Step 0: Load the Quality Model (BLOCKING prerequisite)

1. **Check**: Does [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) resolve (KB installed)?
2. **Act**: If it is **missing**, **HALT** — the quality model is a prerequisite, not a default this skill can invent. Report: _"Quality model not found — install/bootstrap the KB (`quality-model.md` §3.3) before running assess-cost."_
3. **Verify**: The Cost class section (§3.3) and the [cost-assessment guideline](../../../.pair/knowledge/guidelines/quality-assurance/cost-assessment.md) are loaded.

### Step 1: Detect Mode

1. **Check**: Is `$mode` provided?
2. **Skip**: If provided, use it. Proceed to Step 2.
3. **Act**: Auto-detect: a diff/story in context (`$diff`/`$story`, i.e. invoked by `/review` or `/classify`) → `classify`; a `$period` given, or no surface in context → `report`.
4. **Verify**: Mode is set — exactly one mode runs per invocation.

### Step 2: Resolve the Rule Set

1. **Act**: Read the KB default (§3.3 + cost-assessment guideline), then the adoption files (Rule Set layers 2–3), skipping any that don't exist.
2. **Act**: Select the applicable per-provider heuristics from the declared stack/infrastructure (e.g. AWS); for a provider only reachable via an adoption link, resolve that link.
3. **Verify**: Effective catalog + heuristics assembled. Adoption absence is logged as "KB defaults only", not an error.
4. **Act**: Route by mode — `classify` → Step 3; `report` → Step 7.

## Classification Mode (one diff or story)

### Step 3: Resolve the Surface

1. **Act**: Determine the surface: `$diff` (touched files/hunks) or `$story` (declared scope — infra/service load the story introduces), narrowed by `$scope` if given.
2. **Verify**: A concrete surface (file set or story scope) is resolved.

### Step 4: Scan for Cost Signals

1. **Act**: Scan the surface against the cost-signal catalog (maintained in the [cost-assessment guideline](../../../.pair/knowledge/guidelines/quality-assurance/cost-assessment.md)) — e.g. paid-SDK imports (payment/LLM/messaging providers), API-key env vars, IaC/provisioning changes, cron/scheduled jobs, queues/pipelines, media processing, LLM calls. For each hit, record the signal, its location, and the class it maps to per the guideline's heuristics (general + the selected provider's).
2. **Act**: **Unresolvable cost surface** (unknown tech whose cost profile the catalog + adoption cannot resolve): record it as an **unknown-surface** hit and assign it **orange** — the conservative, visible middle-high, never silently green (edge case: "unknown surface" flag).
3. **Verify**: Every touched cost-relevant surface has a signal, a location, and a mapped class; unknown surfaces are flagged, not dropped.

### Step 5: Compute the Class

1. **Act**: **Cost class = the highest detected signal** across all hits (§3.3). **No signal detected ⇒ `green`** with rationale _"no cost surface touched"_ (AC4).
2. **Act**: In refinement (`$story`) the class is the shift-left, declared value; in review (`$diff`) it is the observed value — carried in the same compiled matrix as its own class (never folded into the risk `max`, §3.2), tag token `cost:green|yellow|orange|red`.
3. **Verify**: Exactly one class computed, with a 1-line rationale and the detected-signals list.

### Step 6: Emit the Verdict

1. **Act**: Render the 1-line class + rationale and the collapsed `<details>` signals table per Output Format below — **output-only, no files written**. This is embedded by the caller into the classification matrix's cost dimension (D22 — verdict in ~1 line, details in `<details>`), consumed by `/classify` and shown by `/review`.
2. **Verify**: Verdict emitted. A `red` (or flagged unknown-surface) class is reported for the caller's attention; the skill itself blocks nothing — the merge decision stays `/review`'s.

## Report Mode (period cost monitoring)

Report mode **aggregates and compares**; the classification criteria are **not redefined** here. Each PR's real class comes from re-running the classification path (Steps 3–6) over that PR's merged diff, and each PR's predicted class is read from what refinement already recorded — the catalog/heuristics stay in the guideline (D17/D21), so monitoring can never drift from classification.

The panel's path, period key, in-place idempotency, headline-first shape, empty-period and not-writable behavior all follow the one **report-panel convention** in [working-area.md](../../../.pair/knowledge/guidelines/collaboration/working-area.md) ("Report Panels — Period Key and Idempotent Update") — shared with the delivery/AI-metrics panels, one reports-area pattern for the whole KB. This skill applies that convention; it does not restate it.

### Step 7: Resolve the Period and the Panel Path

1. **Act**: Resolve `$period` to a **period key** in one of the convention's normalized forms — `YYYY-MM` (default: the current calendar month), `YYYY-Wnn`, or `YYYY-MM-DD_YYYY-MM-DD` — and derive the window's start/end dates from it.
2. **Act**: Resolve the panel path: `$output` (default `.pair/working/reports/cost/`, honoring the project's `working_path` override) + `<period-key>-cost-panel.md`.
3. **Verify**: Exactly one period key, one window and one panel path resolved. An unparseable `$period` → ask for the intended window; never guess a period silently.

### Step 8: Collect the Period's Closed PRs

1. **Act**: Read the **closed PRs** whose close/merge date falls inside the window from the PM tool / code host — resolution: see [way-of-working / PM-tool resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). Read-only: report mode never writes to the tracker.
2. **Act**: For each PR collect (a) the **predicted** cost class — the refinement-time class carried in the story/PR body's classification matrix, or the `cost:*` tag when the project projects it (§5); (b) the surface needed to derive the **real** class (the merged diff); (c) the deploy reference, if the project declares deploy/billing telemetry in `infrastructure.md`.
3. **Verify**: Every closed PR of the window is in the set. A PR whose prediction is missing (classified before cost was assessed) is **retained** and marked `no prediction — real only` — never dropped, silently or otherwise.

### Step 9: Pair Predicted vs. Real (bidirectional)

1. **Act**: For each PR, derive the **real** class by running the classification path (Steps 3–6) over its merged diff, then place it beside the predicted class — the bidirectional view: what refinement expected vs. what the merged change actually carries.
2. **Act**: **Deploy match** — with deploy/billing telemetry declared, match the PR to its deploy and record the observed cost movement; **without telemetry the deploy-match dimension reports `not available`** explicitly for every PR, never a fabricated or inferred match.
3. **Verify**: Each row has a predicted value (or `no prediction — real only`), a real value, and a deploy-match value (or `not available`).

### Step 10: Flag Drift

1. **Act**: Drift = predicted ≠ real. Direction is what matters: **under-predicted** (real higher than predicted — e.g. predicted green, real red) is the actionable direction and is flagged first; **over-predicted** (real lower) is reported as calibration signal, not an alarm.
2. **Act**: Aggregate the headline: PRs monitored, drifted (under / over), `no prediction — real only`, class distribution predicted vs. real, and the largest drifts.
3. **Verify**: Every PR is exactly one of `match | under-predicted | over-predicted | no prediction`.

### Step 11: Render and Write the Consolidated Panel

1. **Act**: Render the **consolidated panel** headline-first per the convention (D22): the headline block at the top, the per-PR and per-class breakdowns in collapsed `<details>` sections.
2. **Act**: Write it to the panel path from Step 7, creating the directory when absent. Per the convention, the **period key** identifies the file: a re-run for the same period **updates that panel in place** — one file per period, never a second file, never appended. This is a direct write of an operational artifact (D14), the same exception `/assess-security`'s audit and `/assess-coupling`'s full scope use; no adoption content is ever written here.
3. **Act**: **No cost data** — render and write the panel with the headline `no cost data for this period` plus the reason, rather than failing (AC4); cost monitoring depends on cost having been assessed, so it says so. Two shapes:
   - **No closed PR in the window**: the headline is the whole panel (reason: no closed PRs in the period).
   - **Closed PRs but no prediction on any of them** (cost was never assessed — e.g. Tag Projection not activated, quality-model §5): drift is not computable, so the headline states that with the reason; the real-only rows are still listed (every PR stays `no prediction — real only`, per Step 8.3).
4. **Act**: **Reports area not writable** (read-only checkout, permissions): present the panel **inline** in the output and tell the human where to save it; the run still succeeds.
5. **Verify**: Exactly one panel exists for the period at the resolved path (created or updated in place), or the inline degradation was reported.

## Output Format

### Classification Mode

```text
COST ASSESSMENT (output-only — no files written):
├── Class:    [green | yellow | orange | red] — [1-line rationale]
├── Surface:  [diff | story #ID | scope <area>]
├── Signals:  [N detected — N unknown-surface]
├── Rule Set: [KB default | + provider <name> | + adoption tech/risk-matrix.md]
└── Feeds:    Cost dimension of the classification matrix (quality-model §3.3) — own class, not part of the risk max

<details>
<summary>N cost signals</summary>

| Signal | Location | Class | Notes |
| ------ | -------- | ----- | ----- |
| [signal] | [file:location] | [green|yellow|orange|red] | [provider heuristic / unknown-surface] |
...

</details>
```

No signal detected renders as: `Class: green — no cost surface touched` with an empty (or omitted) signals table.

### Report Mode

```text
COST REPORT (report mode — writes exactly one file: the period panel):
├── Period:   [<period-key>] — [start .. end]
├── PRs:      [N monitored — N with a prediction, N no prediction — real only]
├── Drift:    [N drifted — N under-predicted, N over-predicted | none]
├── Deploy:   [N matched | not available — no deploy telemetry]
├── Panel:    [.pair/working/reports/cost/<period-key>-cost-panel.md — created | updated in place | inline (reports area not writable)]
└── Data:     [ok | no cost data for this period — cost never assessed / Tag Projection not activated]
```

The panel itself (headline-first, D22):

```markdown
# Cost Panel — <period-key>

**Monitored**: N closed PRs (<start> .. <end>) · **Drift**: N (N under-predicted, N over-predicted) · **No prediction**: N · **Deploy match**: N matched | not available

<details>
<summary>Per-PR predicted vs. real</summary>

| PR | Predicted | Real | Drift | Deploy match | Top real signal |
| -- | --------- | ---- | ----- | ------------ | --------------- |
| #ID | [green|yellow|orange|red | no prediction — real only] | [green|yellow|orange|red] | [match | under-predicted | over-predicted | no prediction] | [matched | not available] | [signal @ file:location] |
...

</details>

<details>
<summary>Class distribution — predicted vs. real</summary>

| Class | Predicted | Real |
| ----- | --------- | ---- |
| green / yellow / orange / red | N | N |

</details>
```

An empty window renders the same panel with the headline `no cost data for this period` and the reason, and no per-PR table.

## Composition Interface

When composed by `/review` (review-time cost dimension):

- **Input**: the reviewing skill invokes `/assess-cost` against the PR diff (`$diff`).
- **Output**: returns the class + collapsed signals (Output Format above). The caller embeds it into the review report's cost section (1 line + `<details>`, D22) and feeds the class into `/classify`'s cost dimension.
- **Persistence**: none — this skill writes nothing.

When composed by `/refine-story` / `/classify` (shift-left, refinement):

- Classifies from `$story` scope, producing the declared cost class carried in the story-body matrix — the review pass may only confirm-or-raise it, never lower it (D17 "built twice": the class is estimated from story context at refinement and re-derived from the diff at review — the more conservative of the two wins).

When invoked **independently** (`/assess-cost` on a branch or story): full one-shot classification, verdict returned to the developer.

In **report mode** the skill is standalone: it composes nothing and is composed by nothing — it consumes what classification mode and the quality model already produced (predicted classes recorded at refinement, closed PRs from the tracker) and hands back the panel path. An automation loop or a retro session invokes it on demand; cadence is the caller's concern (D18).

> Review-side wiring (listing `/assess-cost` as a Composed Skill in `/review` and adding the cost section to the review template) is delivered separately (#228). This skill is authored ready-to-compose; nothing here depends on that wiring existing yet.

## Edge Cases

- **No cost-relevant change** (AC4): class `green`, rationale "no cost surface touched".
- **Unresolvable cost surface** (unknown tech): class `orange` with an explicit **unknown-surface** flag — conservative and visible, never silently green (Step 4.2).
- **Quality model missing**: **HALT** with a pointer to install/bootstrap the KB (Step 0) — the model is a prerequisite, not something this skill invents.
- **Provider not covered in-tree**: resolved via the adoption link the adoption file supplies (fallback/extension) — no skill change (Q3).
- **Adoption file missing/malformed**: warn, fall back to KB defaults (D21) — never a HALT.
- **No cost data in the monitored period** (report mode): the panel is still written, headlined `no cost data for this period` with the reason (no closed PRs, or cost never assessed — e.g. Tag Projection not activated); when PRs exist without predictions, their real-only rows are still listed — graceful, never a failure (Step 11.3).
- **PR with no predicted class** (report mode): retained as `no prediction — real only`, contributing to the real-class distribution but not to drift — never dropped from the panel.
- **No deploy telemetry** (report mode): the deploy-match dimension reads `not available` for the whole period rather than fabricating a match.
- **Reports area not writable** (report mode): the panel is presented inline with a save hint; the run succeeds (Step 11.4).

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → minimal assessment against §3.3 alone, ask directly; adoption file missing → run against KB defaults; PM tool unreachable → n/a in `$diff` mode) for the standard scenarios. Additional cases:

- **cost-assessment guideline absent** (KB partially installed): assess against quality-model §3.3's inline signal list only, and note the reduced catalog in the output rather than HALTing.
- **`/classify` not available** (independent invocation): the class is still emitted; it simply isn't folded into a compiled matrix by a caller — the developer reads the verdict directly.
- **PM tool unreachable in report mode**: **HALT** with no partial panel written — a panel covering only the PRs that happened to be reachable would misreport drift. Classification mode is unaffected (it never reads the tracker).
- **working-area guideline absent** (KB partially installed): apply the convention as summarized in Steps 7 and 11 (period-keyed filename, in-place update, headline-first) and note the reduced reference — never HALT.

## Notes

- **Classification mode writes no files** — the strict output-only convention of the assess-\* family; the class is data for `/classify`/`/review`, never an action this skill takes. **Report mode writes exactly one file**: the period panel under `.pair/working/reports/cost/` (D14 operational artifact — the same exception `/assess-security`'s audit and `/assess-coupling`'s full scope use). No adoption content and no backlog items in either mode.
- **Never blocks** — no merge authority in either mode; a `red` class or a flagged drift is a signal for the caller, not a gate this skill enforces.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md): classification mode computes a fresh class every run against the current diff/story by design (signals change commit to commit), no cached verdict; report mode is idempotent **by period key** — a re-run for the same period updates that one panel in place (never a second file).
- **Provider-agnostic** — adding a provider is an adoption/KB change (a per-provider section in the guideline, or an adoption link), never a change to this skill (R2.13).
- **D22** (1-line verdict + collapsed details): a project-level rendering decision the caller honors; this skill emits in that shape.
