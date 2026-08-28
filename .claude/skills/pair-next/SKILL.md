---
name: pair-next
description: "Determines the most relevant next action for your project by reading adoption files and PM tool state. Suggests which skill to invoke next. Use at the start of a session, when switching tasks, or whenever you need guidance on what to work on."
version: 0.6.1
author: Foomakers
---

# /pair-next — Project Navigator

Analyze project state and recommend the single most relevant next skill to invoke. Covers the full 44-skill catalog across all lifecycle phases.

## Arguments (optional)

`/pair-next` accepts two **optional** arguments that SCOPE which backlog items it may select. With neither, it behaves exactly as before — the whole backlog is in scope. This scoping is what makes `/pair-next` the parametrizable atom of automation.

| Argument   | Value                                          | Effect                                                          |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `--root`   | an issue id (epic or story)                    | Restrict selection to that issue's subtree in the PM hierarchy. |
| `--filter` | a single tag/label (e.g. `ui`, `risk:red`)     | Restrict selection to issues carrying that exact label.         |

Both may be combined — the effective scope is the **intersection**: `subtree ∩ matching tags` (see Step 0).

### `--root <issue-id>` — subtree scope

Resolve the issue's descendants through the **PM-tool parent/child hierarchy** (sub-issues / parent links), never through title conventions. Selection is confined to that subtree — nothing outside it is ever proposed.

- **Epic root** → operate at epic level: plan / refine / develop the epic's children only.
- **Story root** → operate on that story: refine or develop it (and its tasks); never step outside it.

The root issue is itself a **first-class member** of the candidate set, alongside its transitive children; a scoped run is a **backlog-item query** over that set. The **item-selection rows (6–11)** of Step 3 and Step 4 **row 16** (`/pair-capability-grill`) run against the candidate set instead of the full backlog — so a Draft story root selects `/pair-process-refine-story` on itself, a Ready story root selects `/pair-process-implement` (or `/pair-process-plan-tasks`), and nothing outside the set is ever proposed. The project-wide detectors are **never** surfaced under a scope: Step 2 (fresh-project detection) and Step 4 rows 12–15 (gate / stack / debt / estimation config) answer whole-project questions — not "which item in this subtree" — so a scoped run does not emit them; if the candidate set yields no actionable item, the run exits cleanly (Step 0 item 5) rather than falling through to them. Step 3 rows 3–5 (`/pair-process-plan-initiatives`, `/pair-process-plan-epics`, `/pair-process-plan-stories`) are **structural planning-gap detectors evaluated root-relatively**, never fired by a subtree's mere absence of a higher layer: a **story root skips rows 3–5 entirely** and begins at row 6 (its planning layers already exist), while an **epic root keeps row 5 scoped to itself** — an epic with no user-story children selects `/pair-process-plan-stories` (the epic-root "plan its children" action) — and skips rows 3–4 (an epic contains no initiatives or epics). Under a `--filter`-only scope (no root) there is no subtree, so rows 3–5, like the other project-wide detectors, are not surfaced.

### `--filter <tag>` — generic tag match

Keep only candidate issues that carry the given label. `--filter` takes a **single label string**, not a boolean expression — there is no AND/OR/NOT grammar; the whole argument is matched literally against each issue's labels. The tag is interpreted **GENERICALLY: `/pair-next` assigns NO meaning to any tag value.** `risk:red` is matched by exactly the same string-equality predicate as `team:ui` — there is no classification, tiering, or severity logic anywhere in this skill (D18). A namespaced-looking label such as `tag:ui` carries **no** namespace semantics either: the whole string (colon included) is one opaque label, matched entire — so `--filter tag:ui` selects issues labelled literally `tag:ui`, exactly as `--filter ui` selects issues labelled `ui`. A filter is a plain PM-tool label query, nothing more.

### Re-evaluation — selection is never cached

The scope is **stateless across steps**. Every run — and every step of a multi-step run — re-queries the PM tool and **re-evaluates** `--root` and `--filter` against the **current** board state. If an issue's tags change between steps (e.g. a review raises `risk:yellow` → `risk:red`), the next step's selection reflects the change immediately. `/pair-next` never reuses a selection computed in a previous step.

## Skill Catalog (44 skills)

The catalog is **derived from the installed corpus**: every skill directory under `.skills/` must appear here — 10 process + 32 capability + `/pair-next` and `/pair-loop` (the two bare, uncategorized navigator skills) = 44. If an installed skill is missing from these tables (or a row names a skill that is not installed), the catalog has drifted: update the tables, the stated counts, and the cascade rows together.

### Process Skills (10)

| Skill              | Lifecycle Phase    | Description                                     |
| ------------------ | ------------------ | ----------------------------------------------- |
| `/pair-process-brainstorm`      | Discovery          | Structured discovery: interview, domain, tree   |
| `/pair-process-specify-prd`     | Induction          | Create or update Product Requirements Document  |
| `/pair-process-bootstrap`       | Induction          | Orchestrate full project setup                  |
| `/pair-process-plan-initiatives`| Strategic          | Create strategic initiatives from PRD           |
| `/pair-process-plan-epics`      | Strategic          | Break initiatives into epics                    |
| `/pair-process-plan-stories`    | Sprint Planning    | Break epics into user stories                   |
| `/pair-process-refine-story`    | Sprint Planning    | Refine story with AC and technical analysis     |
| `/pair-process-plan-tasks`      | Sprint Planning    | Break story into implementation tasks           |
| `/pair-process-implement`       | Sprint Execution   | Implement story tasks with TDD                  |
| `/pair-process-review`          | Sprint Execution   | Review PR through structured phases             |

### Capability Skills (32)

| Skill                    | Category        | Description                                                                  |
| ------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `/pair-capability-map-subdomains`        | Domain Modeling | Scoped DDD subdomain placement (+ Volatility)                                |
| `/pair-capability-map-contexts`          | Domain Modeling | Scoped DDD bounded-context placement + relationship assessment               |
| `/pair-capability-classify`              | Classification  | Apply the quality model → risk/cost matrix + tags (composed by refine-story, review) |
| `/pair-capability-grill`                 | Alignment       | Interview engine: explore a topic or sync on a story, one question at a time |
| `/pair-capability-record-decision`       | Decision        | Record ADR or ADL with adoption update                                       |
| `/pair-capability-checkpoint`            | Session State   | Write/resume story progress checkpoint (work survives context resets)        |
| `/pair-capability-publish-pr`            | Delivery        | Publish a story branch as a PR: gate, PR from template, tags, board state    |
| `/pair-capability-write-issue`           | PM Tool         | Create/update issues in adopted PM tool                                      |
| `/pair-capability-setup-pm`              | PM Tool         | Configure project management tool                                            |
| `/pair-capability-setup-harness`         | Configuration   | Configure an agent harness (pi, opencode, Claude Code) — resolve, verify fitness, provision |
| `/pair-capability-verify-quality`        | Quality         | Check quality gates against codebase                                         |
| `/pair-capability-verify-done`           | Quality         | Check Definition of Done criteria                                            |
| `/pair-capability-verify-adoption`       | Quality         | Check code against adoption files per scope                                  |
| `/pair-capability-assess-stack`          | Assessment      | Assess tech stack (lifecycle-spanning)                                       |
| `/pair-capability-assess-architecture`   | Assessment      | Assess architecture pattern                                                  |
| `/pair-capability-assess-testing`        | Assessment      | Assess testing strategy                                                      |
| `/pair-capability-assess-ai`             | Assessment      | Assess AI development tools                                                  |
| `/pair-capability-assess-methodology`    | Assessment      | Assess development methodology                                               |
| `/pair-capability-assess-pm`             | Assessment      | Assess project management tool                                               |
| `/pair-capability-assess-infrastructure` | Assessment      | Assess infrastructure strategy                                               |
| `/pair-capability-assess-observability`  | Assessment      | Assess observability strategy                                                |
| `/pair-capability-assess-security`       | Assessment      | Assess security posture (review verdict + one-shot audit)                    |
| `/pair-capability-assess-cost`           | Assessment      | Classify cost exposure (green/yellow/orange/red) at review — classify mode output-only; report mode writes one period cost-monitoring panel |
| `/pair-capability-assess-coupling`       | Assessment      | Assess coupling balance (strength × distance × volatility) — diff verdict + full audit |
| `/pair-capability-analyze-debt`          | Analysis        | Analyze technical debt with prioritization                                   |
| `/pair-capability-analyze-code-quality`  | Analysis        | Analyze code quality with metrics                                            |
| `/pair-capability-analyze-delivery-metrics` | Analysis     | Delivery/AI metrics for a period (bug resolution, PR lead time, adoption) → one period panel |
| `/pair-capability-estimate`              | Planning        | Estimate story using adopted methodology                                     |
| `/pair-capability-setup-gates`           | Configuration   | Configure CI/CD quality gates                                                |
| `/pair-capability-manage-flags`          | Configuration   | Manage feature flag lifecycle                                                |
| `/pair-capability-design-manual-tests`   | Testing         | Generate manual test suite from project analysis                             |
| `/pair-capability-execute-manual-tests`  | Testing         | Execute manual test suite + generate report                                  |

### Navigator Skills (2)

The two bare, uncategorized entry points — every other skill lives under `process/` or `capability/`.

| Skill    | Description                                                                              |
| -------- | ----------------------------------------------------------------------------------------- |
| `/pair-next`  | This skill — recommends the single most relevant next skill from project/PM-tool state    |
| `/pair-loop`  | Unattended delivery loop over an automation policy (#250) — fan-out in Claude Code, a degraded one-card + continue-token path elsewhere |

## Algorithm

Execute these checks **in order**. Stop at the first match.

### Step 0: Resolve Selection Scope (arguments)

Run this before every other step, on **every** invocation — the result is never carried over from a previous run or step.

1. **No arguments** → the candidate set is the full backlog; skip to Step 1.
2. **`--root <id>`** → resolve the issue via the PM tool.
   - **Root not found** (id does not resolve to an issue): **HALT** with a clear message (`root <id> not found`) and propose no action.
   - **Root resolves to a Done issue**: report that the root is already Done and exit; propose no work.
   - Otherwise: the candidate set is **the root issue itself plus its transitive children** through the PM-tool hierarchy (parent/child links). The root is a **first-class member** — a childless story or epic root yields a **one-issue** set, not an empty one — and is itself subject to the item-selection rows (a Draft story root → `/pair-process-refine-story`; a Ready story root → `/pair-process-implement` or `/pair-process-plan-tasks`). Later steps read this set instead of the full backlog.
3. **`--filter <tag>`** → narrow the candidate set to issues carrying the tag, using a plain string-equality label query (tag-agnostic — no tag value gets special treatment). **When `--root` is absent the candidate set defaults to the full backlog, which `--filter` then narrows**; when `--root` is present it narrows that subtree.
4. **Both** → apply the intersection: `subtree ∩ matching tags`.
5. **Empty candidate set** — **zero issues** (e.g. `--filter` matches no issue): report `no matching issues` and exit cleanly — an empty result is normal, **not an error**. A childless `--root` (root with no children) is **one** issue, not empty: it flows into the cascade (see item 2). A **non-empty** set whose issues happen to be all non-actionable (e.g. all Done) is likewise not empty here — it falls through to the Step 5 fallback; actionability is decided in Steps 3–4, not by this emptiness check. Item 5's clean exit governs **backlog-item selection only**: a scoped run that finds no actionable item exits here and does **not** surface the project-wide config rows 12–15.

The resolved candidate set feeds the scoped Step 3 item-selection (rows 6–11) and Step 4 row 16 (`/pair-capability-grill`). Step 2 and rows 12–15 (project-wide) are not surfaced under a scope; rows 3–5 are evaluated **root-relatively** (epic root → row 5 only; story root → skipped) — see Step 3. A scope **presupposes an established project** (adoption files populated, a real backlog): on a fresh template project `--root`/`--filter` are never passed — Step 2 fresh-project detection governs and steers to `/pair-process-bootstrap`, so the Step 3 "all adoption files populated" premise always holds under a scope. Because Step 0 re-runs each time, a tag mutation between steps changes the selection on the next step automatically.

### Step 0.5: Resolve the Process Profile

A project may run a **subset** of the process. Read [.pair/adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → `## Process Profile`, resolve it against the [step catalogue](../../../.pair/knowledge/guidelines/technical-standards/ai-development/step-catalogue.md) per the [profile schema](../../../.pair/knowledge/guidelines/technical-standards/ai-development/process-profiles.md), and carry the resulting **enabled step set** into Steps 2–5 — the cascade rows AND the Step 5 fallback, which names skills in prose and is therefore not covered by the row filter. Like Step 0, this runs on **every invocation** and is **re-read every run, never cached** — an edit to way-of-working takes effect on the next run.

1. **No `## Process Profile` section** → the profile is `default`: **every** catalogued step is enabled and the whole cascade below runs **unchanged**, exactly as it did before profiles existed. This is the overwhelmingly common case; skip straight to Step 1.
2. **`profile: default` / `poc`** → the built-in step set from the schema. **`profile: custom`** → the declared `whitelist`.
3. **Validate, and HALT rather than narrow quietly** — a misread profile does not surface as an error a user sees, it removes a step from every suggestion, which looks exactly like that step not being due yet:
   - **unknown profile name** → **HALT**, listing the known profiles (`default`, `poc`, `custom`);
   - **unknown step id** in the whitelist → **HALT**, listing the valid ids from the catalogue. Deliberately a *different* message from the one above: a typo in a step id and a profile that does not exist are not the same mistake, and one generic message sends the reader to the wrong file. A typo must never resolve to "disabled";
   - **no `whitelist` key** under `custom` → **HALT**: `custom` requires one. Deliberately a different message from the next line — "you wrote none" is not "you wrote an empty one", and one message sends the reader hunting for a line their file does not have;
   - **empty whitelist** under `custom` → **HALT** as a **misconfiguration**, never read as "every step disabled";
   - **`whitelist` under a built-in profile, or with no `profile` key** → **HALT**: it would otherwise be silently ignored;
   - **a key in a shape the schema does not accept** (`- profile: poc`, value unbackticked; a bolded key is fine) → **HALT** restating the shape. Read the key **loosely** and its value **strictly**: an unreadable line treated as "no declaration" resolves to `default`, which **widens** the profile to the whole process silently — the one direction of failure nothing downstream catches.
4. **Filter, don't fail.** Any candidate row whose step is disabled is **SKIPPED** — dropped from the cascade and never proposed. A disabled step is **not an error**: evaluation simply continues to the next row, so enabled steps chain correctly across the gaps. **The Step 5 fallback is bound by the same rule**: it is prose, not a row, so apply the filter to it explicitly (Step 5).
5. **Prerequisite consistency (report, don't repair).** Prerequisites are an **any-of**: satisfied when the step's `Requires` list is empty or **at least one** listed step is enabled. For each enabled step whose list is entirely disabled, report the inconsistency with the **minimal fix** — the configuration is readable, so the run continues, and it is **never silently** repaired nor silently tolerated:

   > `plan-stories` is enabled but none of its prerequisites are — minimal fix: enable `plan-epics` or `brainstorm`, or drop `plan-stories`

**Row → step id.** The filter is a lookup, not a judgement — this table is the mapping, so nothing about it is inferred from a row's wording:

| Cascade row                             | Step id                                          |
| --------------------------------------- | -------------------------------------------------- |
| 1 `/pair-process-specify-prd`                        | `specify-prd`                                      |
| 2 `/pair-process-bootstrap`                          | `bootstrap`                                        |
| 3 `/pair-process-plan-initiatives`                   | `plan-initiatives`                                 |
| 4 `/pair-process-plan-epics`                         | `plan-epics`                                       |
| 5 `/pair-process-plan-stories`                       | `plan-stories`                                     |
| 6 `/pair-process-review`                             | `review`                                           |
| 7 `/pair-capability-checkpoint`                         | *(none — not a step, therefore never filtered)*    |
| 8, 9 `/pair-process-implement`                       | `implement`                                        |
| 10 `/pair-process-plan-tasks`                        | `plan-tasks`                                       |
| 11 `/pair-process-refine-story`                      | `refine-story`                                     |
| 12–16                                   | *(none — not steps, therefore never filtered)*     |

Row 7 and rows 12–16 propose **capabilities that are not steps** ([why](../../../.pair/knowledge/guidelines/technical-standards/ai-development/step-catalogue.md#what-this-catalogue-does-not-govern)): the profile governs the process a team runs, not every tool a skill reaches for, so those rows are never filtered by it. `/pair-process-brainstorm` and `/pair-capability-map-subdomains` / `/pair-capability-map-contexts` are steps but have no cascade row — nothing to filter there either; their profile handling is the [process-profile gate](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md) at invocation.

Under `poc` this is what makes the guarantee hold end to end: rows 3 and 4 are dropped, and no DDD-mapping step is reachable from `/pair-next` at all.

### Step 1: Read Adoption Files

Read the following files and classify each as **populated** or **template**:

| File                                                                                               | Template indicator                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [.pair/adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md)                               | Contains `[Product/feature name]` or `[Creation date]`    |
| [.pair/adoption/product/subdomain/README.md](../../../.pair/adoption/product/subdomain/README.md)     | Contains `[list here core subdomain]` or `[PROJECT_NAME]` |
| [.pair/adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md)                   | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/tech-stack.md](../../../.pair/adoption/tech/tech-stack.md)                       | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/boundedcontext/README.md](../../../.pair/adoption/tech/boundedcontext/README.md) | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)               | No PM tool specified or only template text                |

**Template detection rule**: A file is a template if it contains square-bracket placeholders (e.g., `[Product/feature name]`) or if its substantive sections contain no project-specific content.

### Step 2: Cascade — Fresh Project Detection

| #   | Condition                                                 | Suggestion        | Rationale                        |
| --- | --------------------------------------------------------- | ----------------- | -------------------------------- |
| 1   | PRD.md is template                                        | `/pair-process-specify-prd`    | Product vision must come first   |
| 2   | PRD.md populated AND 3+ tech adoption files are templates | `/pair-process-bootstrap`      | Project needs foundational setup |

If any of the above matched, output the suggestion and stop.

> DDD domain mapping (`/pair-capability-map-subdomains`, `/pair-capability-map-contexts`) is a scoped capability, not a mandatory fresh-project step — it is invoked by `/pair-process-plan-initiatives`, `/pair-process-plan-epics`, `/pair-process-refine-story`, `/pair-process-plan-tasks`, or `/pair-process-bootstrap` when they touch a capability/context, not suggested directly here. Projects without DDD artifacts fall back to "system areas" gracefully — no HALT.

### Step 3: Cascade — Established Project Detection

All adoption files are populated. Query the PM tool to determine backlog state — **restricted to the candidate set resolved in Step 0** when `--root`/`--filter` are set (re-evaluated every run, never cached). This restriction is scoped to the **item-selection rows 6–11** (and Step 4 row 16): it includes row 6's open-PR detection — only PRs whose linked issue is inside the candidate set count — so a PR for an issue outside the subtree/filter is **never** surfaced as `/pair-process-review`, preserving the guarantee that nothing outside the scope is ever selected. Rows 3–5 (`/pair-process-plan-initiatives`, `/pair-process-plan-epics`, `/pair-process-plan-stories`) are **structural planning-gap detectors**, not item selectors, and under `--root` are **evaluated root-relatively** — never fired by a subtree's mere structural absence of a higher layer:

- **Story root** → rows 3–5 are **skipped**; the cascade begins at row 6 (the story's initiative/epic/story layers already exist, and its candidate set holds no initiatives or epics to plan).
- **Epic root** → rows 3–4 are skipped (an epic contains no initiatives or epics); **row 5 is kept, scoped to the root epic** — if it has no user-story children, select `/pair-process-plan-stories`. This is the epic-root "plan its children" action.
- **`--filter`-only (no root)** → there is no subtree; rows 3–5, being project-wide structural detectors, are not surfaced (a scoped run is a backlog-item query).

Rows 12–15 are likewise project-wide and not surfaced under a scope; when the candidate set yields no actionable item, Step 0 item 5's clean exit governs (see Step 0).

**Profile filter**: every row below is additionally subject to the enabled step set resolved in Step 0.5 — a row whose step is disabled is skipped, never proposed, and evaluation continues at the next row.

**PM tool discovery**: Read [.pair/adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) to identify the PM tool (GitHub Projects, Jira, Linear, etc.) and access method.

**Code host discovery**: **row 6's open-PR detection queries the code host, not the PM tool** — a PR read is a code-host operation. Resolve `code-host` from way-of-working.md → `## Git Workflow`; **absent ⇒ the code host is the PM tool**, so a single-tool project queries one tool exactly as before. When the two differ, match each open PR to its backlog item through the `Refs: <issue-id>` cross-link in the PR body (that is how "the PR's linked issue" is determined for the candidate-set restriction), while every item/state read below stays on the PM tool. Resolution + routing table: [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).

**State resolution**: The conditions below refer to canonical **macrostates** (`Draft`, `Ready`, `In Progress`, `Review`, `Done`), never board-specific labels. Resolve each item's board state to a macrostate via the `## State Mapping` section in way-of-working.md — omitted ⇒ canonical names are assumed. See [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full resolution rule. When a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), apply the Readiness Fallback: evaluate the [Definition of Ready criteria](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md) against the item instead of guessing from the board-state name.

| #   | Condition                                                        | Suggestion          | Rationale                                   |
| --- | ---------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| 3   | No initiatives or epics exist in PM tool                         | `/pair-process-plan-initiatives` | Strategic planning needed                   |
| 4   | Initiatives exist but no epics                                   | `/pair-process-plan-epics`       | Epic decomposition needed                   |
| 5   | Epics exist but no user stories (under a `--root <epic>` scope this is evaluated **root-relatively** — the root epic's own story children, not the whole board; see the Step 3 header) | `/pair-process-plan-stories`     | Story breakdown needed                      |
| 6   | Open pull requests, or items resolve to macrostate `Review`       | `/pair-process-review`           | Code review pending — closest to delivery   |
| 7   | A story resolves to macrostate `In Progress` AND its checkpoint file exists (`.pair/working/checkpoints/<story-id>.md`) | `/pair-capability-checkpoint` | Resume interrupted work (`$mode: resume`) before re-analysis |
| 8   | A story resolves to macrostate `In Progress` but has NO checkpoint file | `/pair-process-implement`   | Continue the in-progress work — `/pair-process-implement` re-derives state from scratch when no checkpoint exists |
| 9   | Stories resolve to macrostate `Ready` AND a task breakdown exists | `/pair-process-implement`        | Work is ready to start                      |
| 10  | Stories resolve to macrostate `Ready` but have NO task breakdown  | `/pair-process-plan-tasks`       | Tasks must be created before implementation |
| 11  | Stories resolve to macrostate `Draft` (missing acceptance criteria, or failing Definition of Ready via the Readiness Fallback) | `/pair-process-refine-story` | Stories need refinement before work |

**Tie-break**: on a real backlog several of rows 6–11 can hold at once (e.g. Draft stories AND an open PR). Row order resolves this — rows are sorted by delivery proximity (`/pair-process-review` > `/pair-capability-checkpoint` > `/pair-process-implement` > `/pair-process-plan-tasks` > `/pair-process-refine-story`): evaluate top-to-bottom, stop at the first match. For a single item the distinguishing predicates (macrostate, checkpoint file present/absent, task breakdown present/absent) make rows 7–11 mutually exclusive; across items, row order decides. Every `In Progress` story matches row 7 or row 8 — the fallback (Step 5) is never reached for active work.

### Step 4: Capability Skill Suggestions

If no process skill matched in Steps 2-3, check for capability skill opportunities (same rule: evaluate in order, stop at the first match). These rows propose capabilities that are **not steps**, so the Step 0.5 profile filter never applies to them:

| #   | Condition                                                                | Suggestion           | Rationale                                      |
| --- | ------------------------------------------------------------------------ | -------------------- | ---------------------------------------------- |
| 12  | Quality gate not configured (no Quality Gates section in way-of-working) | `/pair-capability-setup-gates`       | Quality gates should be established             |
| 13  | Tech stack has unlisted dependencies detected                            | `/pair-capability-assess-stack`      | Stack registry needs updating                   |
| 14  | Technical debt flags present (TODO/FIXME/HACK comments detected)         | `/pair-capability-analyze-debt`      | Debt should be cataloged and prioritized        |
| 15  | No estimation methodology adopted in way-of-working                      | `/pair-capability-estimate`          | Estimation process should be established        |
| 16  | A backlog item carries open questions or unclear scope (question markers, conflicting comments) that block planning — **restricted to the Step-0 candidate set when `--root`/`--filter` are set** (an out-of-scope item is never surfaced, same as row 6) | `/pair-capability-grill` | Structured one-question-at-a-time alignment before planning |

### Step 5: Fallback

If no condition matched in Steps 2-4:

> All adoption files are populated and no actionable backlog items detected.
> Consider: starting a new iteration with `/pair-process-plan-stories`, or running `/pair-process-review`
> to check for open items.

**The fallback names skills, so the Step 0.5 filter applies here too** — and it is prose, not a row, so it is applied explicitly, in this order:

1. **Never name a disabled step.** Drop it from the sentence. If both named steps are disabled, the sentence is empty — go to rule 2.
2. **Never name a step whose input cannot exist.** `/pair-process-plan-stories` needs epics. On a backlog with no epics, rows 3–4 normally fire first; a profile may disable them, and then nothing upstream covers the empty backlog. In that case name the enabled step that **produces** a backlog — `/pair-process-brainstorm`, which has no cascade row and is otherwise never proposed anywhere.
3. If neither rule leaves a candidate, **report the state and propose no skill**. An empty backlog under a profile with no reachable entry point is a configuration to fix, not a step to run.

| Profile   | Backlog                | Fallback names                                                                       |
| --------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `default` | any                    | `/pair-process-plan-stories` + `/pair-process-review`, verbatim above (row 3 covers the empty-backlog case first) |
| `poc`     | epics exist            | `/pair-process-plan-stories` + `/pair-process-review`                                                            |
| `poc`     | no epics               | `/pair-process-brainstorm` — rows 3–4 are disabled and row 5 needs epics, so it is the only enabled producer of the input `/pair-process-plan-stories` requires |
| `custom`  | any                    | rules 1–3 above, in order                                                              |

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
├── Profile: [default (no section) | poc | custom — N/M steps enabled]
└── Backlog: [summary of current items — within scope]

RECOMMENDATION: /skill-name
REASON: [one-line explanation]
```

When `--root`/`--filter` yield no work, replace the recommendation with the corresponding Step 0 outcome (`root <id> not found` → HALT; `root <id> is Done` → exit; `no matching issues` → clean exit).

Then ask: "Shall I run `/skill-name`?"

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (PM tool not accessible → skip Step 3, recommend from adoption files only; adoption files missing → suggest `/pair-process-bootstrap` as the entry point) for the standard scenarios. Additional cases:

- **Argument edge cases** (see Step 0): `--root` not found → HALT, no action; `--root` resolves to a Done issue → report and exit; `--filter` (or the subtree) matches nothing → report `no matching issues` and exit cleanly (an empty result is not an error).
- If a suggested skill is not installed, tell the user which skill is needed and where to find it.
- If way-of-working.md has no `## Process Profile` section, the `default` profile applies — every step enabled, cascade unchanged. This is the zero-configuration default, not a degradation; the profile's own error cases (unknown name/id, empty whitelist) HALT instead, per Step 0.5.
- If way-of-working.md has no `## State Mapping` section, canonical macrostate names are assumed — this is the zero-configuration default, not a degradation.
- If way-of-working.md declares no `code-host`, the code host is the PM tool — likewise the zero-configuration default, not a degradation. If a **declared** code host is unreachable, skip row 6's open-PR detection (say so) and evaluate the remaining rows from PM-tool state; never HALT a read-only recommendation over it.
- If a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), apply the Readiness Fallback ([Definition of Ready criteria](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md)) rather than treating row 11's condition as unresolvable.

## Notes

- This skill is read-only: it inspects state but never modifies files, PM tool data, or code-host data.
- Row order encodes the tie-break (delivery proximity) — see the **Tie-break** note under the Step 3 table.
- Re-run `/pair-next` after completing any skill to get an updated recommendation.
- **Full catalog coverage**: nearly all of the 44 skills can be suggested — process skills via the cascading checks (Steps 2-3), capability skills via targeted checks (row 7 `/pair-capability-checkpoint`, rows 12-16 including `/pair-capability-grill`) or process-skill composition. `/pair-capability-publish-pr` will be reachable via `/pair-process-implement` once wired (not yet composed), so `/pair-next` cannot surface it today. `/pair-process-brainstorm` is a human-initiated discovery entry point — it opens a theme the backlog does not yet contain, which no board-state condition can detect — so it is catalogued here but never suggested by the cascade. `/pair-capability-analyze-delivery-metrics` is the same shape for the same reason: a retro/period report is wanted on a cadence the board does not express, so it is catalogued and reachable on demand, never cascade-suggested.
