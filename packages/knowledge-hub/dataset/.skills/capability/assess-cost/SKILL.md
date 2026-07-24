---
name: assess-cost
description: "Classifies the financial exposure of a change as a chromatic cost class (green/yellow/orange/red) at review or on demand, by scanning the diff/story for cost signals against the KB cost-signal catalog resolved through the project's stack/architecture/infrastructure adoption. Output-only: emits the cost dimension of the classification matrix (1-line verdict + collapsed details, D22) for /classify and /review to consume — writes nothing, blocks nothing. Multi-provider by construction: adding a provider touches adoption/KB only, never this skill."
version: 0.1.0
author: Foomakers
---

# /assess-cost — Cost Assessment

Classify the financial exposure of a change as a chromatic **cost class** (`green` / `yellow` / `orange` / `red`) from the cost signals present in the diff (or, at refinement, the story scope), against a rule set resolved from the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) (§2 Cost pillar, §3.3 Cost class) plus the [cost-assessment guideline](../../../.pair/knowledge/guidelines/quality-assurance/cost-assessment.md) — the single home of the cost-signal catalog, the general + provider-specific heuristics (AWS first), and the cost gotchas.

**Output-only.** This skill emits the cost dimension of the classification matrix and nothing else: it **writes no files, creates no backlog items, and never blocks** a PR or merge (it has no such authority — the merge decision stays with `/review`, exactly as the `assess-security` sibling reports a verdict but never blocks). The cost class it computes is consumed by `/classify` and `/review`; the skill never interprets or acts on its own verdict.

**Provider-agnostic core (R2.13).** No provider names are hardcoded in this skill. Which heuristics apply is selected by the project's `tech-stack.md` / `architecture.md` / `infrastructure.md` adoption files (Q3); the catalog and per-provider heuristics live in the guideline (D17/D21). Adding a provider is an adoption/KB change (a new per-provider section or an adoption link), never a change to this skill.

## Arguments

| Argument  | Required | Description                                                                                                                              |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `$diff`   | No       | The PR/branch diff to classify. Default when invoked by `/review` or against a branch: the current diff.                                 |
| `$story`  | No       | A story/issue to classify from its declared scope instead of a diff — the refinement-time (shift-left) path, mirroring the risk matrix built twice. |
| `$scope`  | No       | Area/package to scope the scan (default: the whole diff/story). Package-scoped only — never narrows the rule set, only the surface scanned. |

`$diff` and `$story` are mutually exclusive inputs; exactly one surface is classified per run. Neither provided → auto-detect: a PR/diff in context (i.e. invoked by `/review`) → `$diff`; a story in context (i.e. invoked by `/refine-story`/`/classify` in refinement) → `$story`.

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

### Step 1: Resolve the Rule Set

1. **Act**: Read the KB default (§3.3 + cost-assessment guideline), then the adoption files (Rule Set layers 2–3), skipping any that don't exist.
2. **Act**: Select the applicable per-provider heuristics from the declared stack/infrastructure (e.g. AWS); for a provider only reachable via an adoption link, resolve that link.
3. **Verify**: Effective catalog + heuristics assembled. Adoption absence is logged as "KB defaults only", not an error.

### Step 2: Resolve the Surface

1. **Act**: Determine the surface: `$diff` (touched files/hunks) or `$story` (declared scope — infra/service load the story introduces), narrowed by `$scope` if given.
2. **Verify**: A concrete surface (file set or story scope) is resolved.

### Step 3: Scan for Cost Signals

1. **Act**: Scan the surface against the cost-signal catalog (maintained in the [cost-assessment guideline](../../../.pair/knowledge/guidelines/quality-assurance/cost-assessment.md)) — e.g. paid-SDK imports (payment/LLM/messaging providers), API-key env vars, IaC/provisioning changes, cron/scheduled jobs, queues/pipelines, media processing, LLM calls. For each hit, record the signal, its location, and the class it maps to per the guideline's heuristics (general + the selected provider's).
2. **Act**: **Unresolvable cost surface** (unknown tech whose cost profile the catalog + adoption cannot resolve): record it as an **unknown-surface** hit and assign it **orange** — the conservative, visible middle-high, never silently green (edge case: "unknown surface" flag).
3. **Verify**: Every touched cost-relevant surface has a signal, a location, and a mapped class; unknown surfaces are flagged, not dropped.

### Step 4: Compute the Class

1. **Act**: **Cost class = the highest detected signal** across all hits (§3.3). **No signal detected ⇒ `green`** with rationale _"no cost surface touched"_ (AC4).
2. **Act**: In refinement (`$story`) the class is the shift-left, declared value; in review (`$diff`) it is the observed value — carried in the same compiled matrix as its own class (never folded into the risk `max`, §3.2), tag token `cost:green|yellow|orange|red`.
3. **Verify**: Exactly one class computed, with a 1-line rationale and the detected-signals list.

### Step 5: Emit the Verdict

1. **Act**: Render the 1-line class + rationale and the collapsed `<details>` signals table per Output Format below — **output-only, no files written**. This is embedded by the caller into the classification matrix's cost dimension (D22 — verdict in ~1 line, details in `<details>`), consumed by `/classify` and shown by `/review`.
2. **Verify**: Verdict emitted. A `red` (or flagged unknown-surface) class is reported for the caller's attention; the skill itself blocks nothing — the merge decision stays `/review`'s.

## Output Format

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

## Composition Interface

When composed by `/review` (review-time cost dimension):

- **Input**: the reviewing skill invokes `/assess-cost` against the PR diff (`$diff`).
- **Output**: returns the class + collapsed signals (Output Format above). The caller embeds it into the review report's cost section (1 line + `<details>`, D22) and feeds the class into `/classify`'s cost dimension.
- **Persistence**: none — this skill writes nothing.

When composed by `/refine-story` / `/classify` (shift-left, refinement):

- Classifies from `$story` scope, producing the declared cost class carried in the story-body matrix — the review pass may only confirm-or-raise it, never lower it (D17 "built twice": the class is estimated from story context at refinement and re-derived from the diff at review — the more conservative of the two wins).

When invoked **independently** (`/assess-cost` on a branch or story): full one-shot classification, verdict returned to the developer.

> Review-side wiring (listing `/assess-cost` as a Composed Skill in `/review` and adding the cost section to the review template) is delivered separately (#228). This skill is authored ready-to-compose; nothing here depends on that wiring existing yet.

## Edge Cases

- **No cost-relevant change** (AC4): class `green`, rationale "no cost surface touched".
- **Unresolvable cost surface** (unknown tech): class `orange` with an explicit **unknown-surface** flag — conservative and visible, never silently green (Step 3.2).
- **Quality model missing**: **HALT** with a pointer to install/bootstrap the KB (Step 0) — the model is a prerequisite, not something this skill invents.
- **Provider not covered in-tree**: resolved via the adoption link the adoption file supplies (fallback/extension) — no skill change (Q3).
- **Adoption file missing/malformed**: warn, fall back to KB defaults (D21) — never a HALT.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → minimal assessment against §3.3 alone, ask directly; adoption file missing → run against KB defaults; PM tool unreachable → n/a in `$diff` mode) for the standard scenarios. Additional cases:

- **cost-assessment guideline absent** (KB partially installed): assess against quality-model §3.3's inline signal list only, and note the reduced catalog in the output rather than HALTing.
- **`/classify` not available** (independent invocation): the class is still emitted; it simply isn't folded into a compiled matrix by a caller — the developer reads the verdict directly.

## Notes

- **Writes nothing** — the strict output-only convention of the assess-* family (unlike `assess-security`, this skill has no report/audit mode: report/monitoring is deliberately split to a separate slice). The class is data for `/classify`/`/review`, never an action this skill takes.
- **Never blocks** — no merge authority; a `red` class is a signal for the caller, not a gate this skill enforces.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md): a fresh class is computed every run against the current diff/story by design (signals change commit to commit); no cached verdict.
- **Provider-agnostic** — adding a provider is an adoption/KB change (a per-provider section in the guideline, or an adoption link), never a change to this skill (R2.13).
- **D22** (1-line verdict + collapsed details): a project-level rendering decision the caller honors; this skill emits in that shape.
