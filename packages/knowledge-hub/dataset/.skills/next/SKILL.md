---
name: next
description: "Determines the most relevant next action for your project by reading adoption files and PM tool state. Suggests which skill to invoke next. Use at the start of a session, when switching tasks, or whenever you need guidance on what to work on."
version: 0.5.0
author: Foomakers
---

# /next — Project Navigator

Analyze project state and recommend the single most relevant next skill to invoke. Covers the full 38-skill catalog across all lifecycle phases.

## Arguments (optional)

`/next` accepts two **optional** arguments that SCOPE which backlog items it may select. With neither, it behaves exactly as before — the whole backlog is in scope. This scoping is what makes `/next` the parametrizable atom of automation.

| Argument   | Value                                          | Effect                                                          |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `--root`   | an issue id (epic or story)                    | Restrict selection to that issue's subtree in the PM hierarchy. |
| `--filter` | a single tag/label (e.g. `ui`, `risk:red`)     | Restrict selection to issues carrying that exact label.         |

Both may be combined — the effective scope is the **intersection**: `subtree ∩ matching tags` (see Step 0).

### `--root <issue-id>` — subtree scope

Resolve the issue's descendants through the **PM-tool parent/child hierarchy** (sub-issues / parent links), never through title conventions. Selection is confined to that subtree — nothing outside it is ever proposed.

- **Epic root** → operate at epic level: plan / refine / develop the epic's children only.
- **Story root** → operate on that story: refine or develop it (and its tasks); never step outside it.

The root issue is itself a **first-class member** of the candidate set, alongside its transitive children; a scoped run is a **backlog-item query** over that set. The **item-selection rows (6–11)** of Step 3 and Step 4 **row 16** (`/grill`) run against the candidate set instead of the full backlog — so a Draft story root selects `/refine-story` on itself, a Ready story root selects `/implement` (or `/plan-tasks`), and nothing outside the set is ever proposed. The project-wide detectors are **never** surfaced under a scope: Step 2 (fresh-project detection) and Step 4 rows 12–15 (gate / stack / debt / estimation config) answer whole-project questions — not "which item in this subtree" — so a scoped run does not emit them; if the candidate set yields no actionable item, the run exits cleanly (Step 0 item 5) rather than falling through to them. Step 3 rows 3–5 (`/plan-initiatives`, `/plan-epics`, `/plan-stories`) are **structural planning-gap detectors evaluated root-relatively**, never fired by a subtree's mere absence of a higher layer: a **story root skips rows 3–5 entirely** and begins at row 6 (its planning layers already exist), while an **epic root keeps row 5 scoped to itself** — an epic with no user-story children selects `/plan-stories` (the epic-root "plan its children" action) — and skips rows 3–4 (an epic contains no initiatives or epics). Under a `--filter`-only scope (no root) there is no subtree, so rows 3–5, like the other project-wide detectors, are not surfaced.

### `--filter <tag>` — generic tag match

Keep only candidate issues that carry the given label. `--filter` takes a **single label string**, not a boolean expression — there is no AND/OR/NOT grammar; the whole argument is matched literally against each issue's labels. The tag is interpreted **GENERICALLY: `/next` assigns NO meaning to any tag value.** `risk:red` is matched by exactly the same string-equality predicate as `team:ui` — there is no classification, tiering, or severity logic anywhere in this skill (D18). A filter is a plain PM-tool label query, nothing more.

### Re-evaluation — selection is never cached

The scope is **stateless across steps**. Every run — and every step of a multi-step run — re-queries the PM tool and **re-evaluates** `--root` and `--filter` against the **current** board state. If an issue's tags change between steps (e.g. a review raises `risk:yellow` → `risk:red`), the next step's selection reflects the change immediately. `/next` never reuses a selection computed in a previous step.

## Skill Catalog (38 skills)

The catalog is **derived from the installed corpus**: every skill directory under `.skills/` must appear here — 9 process + 28 capability + `/next` itself = 38. If an installed skill is missing from these tables (or a row names a skill that is not installed), the catalog has drifted: update the tables, the stated counts, and the cascade rows together.

### Process Skills (9)

| Skill              | Lifecycle Phase    | Description                                     |
| ------------------ | ------------------ | ----------------------------------------------- |
| `/specify-prd`     | Induction          | Create or update Product Requirements Document  |
| `/bootstrap`       | Induction          | Orchestrate full project setup                  |
| `/plan-initiatives`| Strategic          | Create strategic initiatives from PRD           |
| `/plan-epics`      | Strategic          | Break initiatives into epics                    |
| `/plan-stories`    | Sprint Planning    | Break epics into user stories                   |
| `/refine-story`    | Sprint Planning    | Refine story with AC and technical analysis     |
| `/plan-tasks`      | Sprint Planning    | Break story into implementation tasks           |
| `/implement`       | Sprint Execution   | Implement story tasks with TDD                  |
| `/review`          | Sprint Execution   | Review PR through structured phases             |

### Capability Skills (28)

| Skill                    | Category        | Description                                                                  |
| ------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `/map-subdomains`        | Domain Modeling | Scoped DDD subdomain placement (+ Volatility)                                |
| `/map-contexts`          | Domain Modeling | Scoped DDD bounded-context placement + relationship assessment               |
| `/classify`              | Classification  | Apply the quality model → risk/cost matrix + tags (composed by refine-story, review) |
| `/grill`                 | Alignment       | Interview engine: explore a topic or sync on a story, one question at a time |
| `/record-decision`       | Decision        | Record ADR or ADL with adoption update                                       |
| `/checkpoint`            | Session State   | Write/resume story progress checkpoint (work survives context resets)        |
| `/publish-pr`            | Delivery        | Publish a story branch as a PR: gate, PR from template, tags, board state    |
| `/write-issue`           | PM Tool         | Create/update issues in adopted PM tool                                      |
| `/setup-pm`              | PM Tool         | Configure project management tool                                            |
| `/verify-quality`        | Quality         | Check quality gates against codebase                                         |
| `/verify-done`           | Quality         | Check Definition of Done criteria                                            |
| `/verify-adoption`       | Quality         | Check code against adoption files per scope                                  |
| `/assess-stack`          | Assessment      | Assess tech stack (lifecycle-spanning)                                       |
| `/assess-architecture`   | Assessment      | Assess architecture pattern                                                  |
| `/assess-testing`        | Assessment      | Assess testing strategy                                                      |
| `/assess-ai`             | Assessment      | Assess AI development tools                                                  |
| `/assess-methodology`    | Assessment      | Assess development methodology                                               |
| `/assess-pm`             | Assessment      | Assess project management tool                                               |
| `/assess-infrastructure` | Assessment      | Assess infrastructure strategy                                               |
| `/assess-observability`  | Assessment      | Assess observability strategy                                                |
| `/assess-security`       | Assessment      | Assess security posture (review verdict + one-shot audit)                    |
| `/analyze-debt`          | Analysis        | Analyze technical debt with prioritization                                   |
| `/analyze-code-quality`  | Analysis        | Analyze code quality with metrics                                            |
| `/estimate`              | Planning        | Estimate story using adopted methodology                                     |
| `/setup-gates`           | Configuration   | Configure CI/CD quality gates                                                |
| `/manage-flags`          | Configuration   | Manage feature flag lifecycle                                                |
| `/design-manual-tests`   | Testing         | Generate manual test suite from project analysis                             |
| `/execute-manual-tests`  | Testing         | Execute manual test suite + generate report                                  |

## Algorithm

Execute these checks **in order**. Stop at the first match.

### Step 0: Resolve Selection Scope (arguments)

Run this before every other step, on **every** invocation — the result is never carried over from a previous run or step.

1. **No arguments** → the candidate set is the full backlog; skip to Step 1.
2. **`--root <id>`** → resolve the issue via the PM tool.
   - **Root not found** (id does not resolve to an issue): **HALT** with a clear message (`root <id> not found`) and propose no action.
   - **Root resolves to a Done issue**: report that the root is already Done and exit; propose no work.
   - Otherwise: the candidate set is **the root issue itself plus its transitive children** through the PM-tool hierarchy (parent/child links). The root is a **first-class member** — a childless story or epic root yields a **one-issue** set, not an empty one — and is itself subject to the item-selection rows (a Draft story root → `/refine-story`; a Ready story root → `/implement` or `/plan-tasks`). Later steps read this set instead of the full backlog.
3. **`--filter <tag>`** → narrow the candidate set to issues carrying the tag, using a plain string-equality label query (tag-agnostic — no tag value gets special treatment). **When `--root` is absent the candidate set defaults to the full backlog, which `--filter` then narrows**; when `--root` is present it narrows that subtree.
4. **Both** → apply the intersection: `subtree ∩ matching tags`.
5. **Empty candidate set** — **zero issues** (e.g. `--filter` matches no issue): report `no matching issues` and exit cleanly — an empty result is normal, **not an error**. A childless `--root` (root with no children) is **one** issue, not empty: it flows into the cascade (see item 2). A **non-empty** set whose issues happen to be all non-actionable (e.g. all Done) is likewise not empty here — it falls through to the Step 5 fallback; actionability is decided in Steps 3–4, not by this emptiness check. Item 5's clean exit governs **backlog-item selection only**: a scoped run that finds no actionable item exits here and does **not** surface the project-wide config rows 12–15.

The resolved candidate set feeds the scoped Step 3 item-selection (rows 6–11) and Step 4 row 16 (`/grill`). Step 2 and rows 12–15 (project-wide) are not surfaced under a scope; rows 3–5 are evaluated **root-relatively** (epic root → row 5 only; story root → skipped) — see Step 3. Because Step 0 re-runs each time, a tag mutation between steps changes the selection on the next step automatically.

### Step 1: Read Adoption Files

Read the following files and classify each as **populated** or **template**:

| File                                                                                               | Template indicator                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [.pair/adoption/product/PRD.md](../../.pair/adoption/product/PRD.md)                               | Contains `[Product/feature name]` or `[Creation date]`    |
| [.pair/adoption/product/subdomain/README.md](../../.pair/adoption/product/subdomain/README.md)     | Contains `[list here core subdomain]` or `[PROJECT_NAME]` |
| [.pair/adoption/tech/architecture.md](../../.pair/adoption/tech/architecture.md)                   | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/tech-stack.md](../../.pair/adoption/tech/tech-stack.md)                       | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/boundedcontext/README.md](../../.pair/adoption/tech/boundedcontext/README.md) | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/way-of-working.md](../../.pair/adoption/tech/way-of-working.md)               | No PM tool specified or only template text                |

**Template detection rule**: A file is a template if it contains square-bracket placeholders (e.g., `[Product/feature name]`) or if its substantive sections contain no project-specific content.

### Step 2: Cascade — Fresh Project Detection

| #   | Condition                                                 | Suggestion        | Rationale                        |
| --- | --------------------------------------------------------- | ----------------- | -------------------------------- |
| 1   | PRD.md is template                                        | `/specify-prd`    | Product vision must come first   |
| 2   | PRD.md populated AND 3+ tech adoption files are templates | `/bootstrap`      | Project needs foundational setup |

If any of the above matched, output the suggestion and stop.

> DDD domain mapping (`/map-subdomains`, `/map-contexts`) is a scoped capability, not a mandatory fresh-project step — it is invoked by `/plan-initiatives`, `/plan-epics`, `/refine-story`, `/plan-tasks`, or `/bootstrap` when they touch a capability/context, not suggested directly here. Projects without DDD artifacts fall back to "system areas" gracefully — no HALT.

### Step 3: Cascade — Established Project Detection

All adoption files are populated. Query the PM tool to determine backlog state — **restricted to the candidate set resolved in Step 0** when `--root`/`--filter` are set (re-evaluated every run, never cached). This restriction is scoped to the **item-selection rows 6–11** (and Step 4 row 16): it includes row 6's open-PR detection — only PRs whose linked issue is inside the candidate set count — so a PR for an issue outside the subtree/filter is **never** surfaced as `/review`, preserving the guarantee that nothing outside the scope is ever selected. Rows 3–5 (`/plan-initiatives`, `/plan-epics`, `/plan-stories`) are **structural planning-gap detectors**, not item selectors, and under `--root` are **evaluated root-relatively** — never fired by a subtree's mere structural absence of a higher layer:

- **Story root** → rows 3–5 are **skipped**; the cascade begins at row 6 (the story's initiative/epic/story layers already exist, and its candidate set holds no initiatives or epics to plan).
- **Epic root** → rows 3–4 are skipped (an epic contains no initiatives or epics); **row 5 is kept, scoped to the root epic** — if it has no user-story children, select `/plan-stories`. This is the epic-root "plan its children" action AC1 requires.
- **`--filter`-only (no root)** → there is no subtree; rows 3–5, being project-wide structural detectors, are not surfaced (a scoped run is a backlog-item query).

Rows 12–15 are likewise project-wide and not surfaced under a scope; when the candidate set yields no actionable item, Step 0 item 5's clean exit governs (see Step 0).

**PM tool discovery**: Read [.pair/adoption/tech/way-of-working.md](../../.pair/adoption/tech/way-of-working.md) to identify the PM tool (GitHub Projects, Jira, Linear, etc.) and access method.

**State resolution**: The conditions below refer to canonical **macrostates** (`Draft`, `Ready`, `In Progress`, `Review`, `Done`), never board-specific labels. Resolve each item's board state to a macrostate via the `## State Mapping` section in way-of-working.md — omitted ⇒ canonical names are assumed. See [canonical-states.md](../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full resolution rule. When a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), apply the Readiness Fallback: evaluate the [Definition of Ready criteria](../../.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md) against the item instead of guessing from the board-state name.

| #   | Condition                                                        | Suggestion          | Rationale                                   |
| --- | ---------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| 3   | No initiatives or epics exist in PM tool                         | `/plan-initiatives` | Strategic planning needed                   |
| 4   | Initiatives exist but no epics                                   | `/plan-epics`       | Epic decomposition needed                   |
| 5   | Epics exist but no user stories                                  | `/plan-stories`     | Story breakdown needed                      |
| 6   | Open pull requests, or items resolve to macrostate `Review`       | `/review`           | Code review pending — closest to delivery   |
| 7   | A story resolves to macrostate `In Progress` AND its checkpoint file exists (`.pair/working/checkpoints/<story-id>.md`) | `/checkpoint` | Resume interrupted work (`$mode: resume`) before re-analysis |
| 8   | A story resolves to macrostate `In Progress` but has NO checkpoint file | `/implement`   | Continue the in-progress work — `/implement` re-derives state from scratch when no checkpoint exists |
| 9   | Stories resolve to macrostate `Ready` AND a task breakdown exists | `/implement`        | Work is ready to start                      |
| 10  | Stories resolve to macrostate `Ready` but have NO task breakdown  | `/plan-tasks`       | Tasks must be created before implementation |
| 11  | Stories resolve to macrostate `Draft` (missing acceptance criteria, or failing Definition of Ready via the Readiness Fallback) | `/refine-story` | Stories need refinement before work |

**Tie-break**: on a real backlog several of rows 6–11 can hold at once (e.g. Draft stories AND an open PR). Row order resolves this — rows are sorted by delivery proximity (`/review` > `/checkpoint` > `/implement` > `/plan-tasks` > `/refine-story`): evaluate top-to-bottom, stop at the first match. For a single item the distinguishing predicates (macrostate, checkpoint file present/absent, task breakdown present/absent) make rows 7–11 mutually exclusive; across items, row order decides. Every `In Progress` story matches row 7 or row 8 — the fallback (Step 5) is never reached for active work.

### Step 4: Capability Skill Suggestions

If no process skill matched in Steps 2-3, check for capability skill opportunities (same rule: evaluate in order, stop at the first match):

| #   | Condition                                                                | Suggestion           | Rationale                                      |
| --- | ------------------------------------------------------------------------ | -------------------- | ---------------------------------------------- |
| 12  | Quality gate not configured (no Quality Gates section in way-of-working) | `/setup-gates`       | Quality gates should be established             |
| 13  | Tech stack has unlisted dependencies detected                            | `/assess-stack`      | Stack registry needs updating                   |
| 14  | Technical debt flags present (TODO/FIXME/HACK comments detected)         | `/analyze-debt`      | Debt should be cataloged and prioritized        |
| 15  | No estimation methodology adopted in way-of-working                      | `/estimate`          | Estimation process should be established        |
| 16  | A backlog item carries open questions or unclear scope (question markers, conflicting comments) that block planning — **restricted to the Step-0 candidate set when `--root`/`--filter` are set** (an out-of-scope item is never surfaced, same as row 6) | `/grill` | Structured one-question-at-a-time alignment before planning |

### Step 5: Fallback

If no condition matched in Steps 2-4:

> All adoption files are populated and no actionable backlog items detected.
> Consider: starting a new iteration with `/plan-stories`, or running `/review`
> to check for open items.

## Output Format

Present results as:

```text
PROJECT STATE:
├── PRD: [populated | template]
├── Bootstrap: [complete | incomplete — N/M adoption files populated]
├── Subdomains: [populated | template]
├── Bounded Contexts: [populated | template]
├── PM Tool: [tool name | not configured]
├── Scope: [full backlog | root #ID (subtree) | filter <tag> | root #ID ∩ <tag>]
└── Backlog: [summary of current items — within scope]

RECOMMENDATION: /skill-name
REASON: [one-line explanation]
```

When `--root`/`--filter` yield no work, replace the recommendation with the corresponding Step 0 outcome (`root <id> not found` → HALT; `root <id> is Done` → exit; `no matching issues` → clean exit).

Then ask: "Shall I run `/skill-name`?"

## Graceful Degradation

See [graceful degradation](../../.pair/knowledge/skill-conventions/graceful-degradation.md) (PM tool not accessible → skip Step 3, recommend from adoption files only; adoption files missing → suggest `/bootstrap` as the entry point) for the standard scenarios. Additional cases:

- **Argument edge cases** (see Step 0): `--root` not found → HALT, no action; `--root` resolves to a Done issue → report and exit; `--filter` (or the subtree) matches nothing → report `no matching issues` and exit cleanly (an empty result is not an error).
- If a suggested skill is not installed, tell the user which skill is needed and where to find it.
- If way-of-working.md has no `## State Mapping` section, canonical macrostate names are assumed — this is the zero-configuration default, not a degradation.
- If a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), apply the Readiness Fallback ([Definition of Ready criteria](../../.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md)) rather than treating row 11's condition as unresolvable.

## Notes

- This skill is read-only: it inspects state but never modifies files or PM tool data.
- Row order encodes the tie-break (delivery proximity) — see the **Tie-break** note under the Step 3 table.
- Re-run `/next` after completing any skill to get an updated recommendation.
- **Full catalog coverage**: nearly all of the 38 skills can be suggested — process skills via the cascading checks (Steps 2-3), capability skills via targeted checks (row 7 `/checkpoint`, rows 12-16 including `/grill`) or process-skill composition. `/publish-pr` will be reachable via `/implement` once wired (not yet composed), so `/next` cannot surface it today.
