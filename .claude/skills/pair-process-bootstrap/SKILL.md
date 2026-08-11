---
name: pair-process-bootstrap
description: "Orchestrates full project setup — PRD verification, project categorization, checklist, standards, quality gates, PM tool — for a brand-new project, end to end. Composes /pair-process-specify-prd, /pair-capability-setup-pm, /pair-capability-record-decision, assess-* (optional)."
version: 0.7.0
author: Foomakers
---

# /pair-process-bootstrap — Project Bootstrap

Orchestrate the complete project setup sequence. Transforms a PRD into a fully configured project with adopted standards, quality gates, and PM tool integration. Each phase checks output existence before acting — re-invocation resumes from the first incomplete phase.

## Composed Skills

| Skill                   | Type       | Required                                                                      |
| ----------------------- | ---------- | ----------------------------------------------------------------------------- |
| `/pair-process-specify-prd`          | Process    | Yes — invoked if PRD is missing or template                                   |
| `/pair-capability-setup-pm`             | Capability | Yes — invoked in finalization phase for PM tool configuration                 |
| `/pair-capability-record-decision`      | Capability | Yes — invoked for each bootstrap decision (categorization, tech choices, etc) |
| `/pair-capability-assess-architecture`  | Capability | Optional — architecture pattern assessment. Graceful degradation if absent.   |
| `/pair-capability-assess-stack`         | Capability | Optional — tech stack assessment (core sections). Graceful degradation if absent. |
| `/pair-capability-assess-testing`       | Capability | Optional — testing strategy assessment. Graceful degradation if absent.       |
| `/pair-capability-assess-infrastructure`| Capability | Optional — infrastructure assessment. Graceful degradation if absent.         |
| `/pair-capability-assess-observability` | Capability | Optional — observability assessment. Graceful degradation if absent.          |
| `/pair-capability-assess-methodology`   | Capability | Optional — methodology assessment. Graceful degradation if absent.            |
| `/pair-capability-assess-pm`            | Capability | Optional — PM tool assessment (delegates to /pair-capability-setup-pm). Graceful degradation if absent. |
| `/pair-capability-assess-ai`            | Capability | Optional — AI development tools assessment. Graceful degradation if absent.   |
| `/pair-capability-map-subdomains`       | Capability | Optional — full-catalog (`$scope: all`) domain mapping, the only caller allowed this scope. Graceful degradation if absent. |
| `/pair-capability-map-contexts`         | Capability | Optional — full-catalog (`$scope: all`) context mapping, the only caller allowed this scope. Graceful degradation if absent. |

## Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
| `$mode`  | No       | Resolution depth: `guided` (the **declared default**) or `quick`. Absent ⇒ `guided`, and Phases 0-4 below run unchanged. `quick` takes KB-sensible defaults instead of asking, per the [Guided / Quick Setup Convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md). Passing `guided` explicitly is accepted as a **loud no-op** — a deliberate, documented deviation from the convention's minimum (it fixes only that an explicit signal must select the **non-default** depth), kept for callers that want the depth visible at the call site; see [quick-mode-defaults.md](./quick-mode-defaults.md) § Selector. See Resolution Depth below. |

## Resolution Depth: guided (default) or quick

One entry point, two resolution depths. Quick mode is **additive**: a second resolution depth of the same skill — not a separate skill, not a replacement for the guided path. Both depths run the same phases, compose the same skills, and write the same files; the depth decides only whether the developer is *asked* for each decision (guided) or the resolved default is *taken as-is* (quick).

- **guided** — bootstrap's **declared default**, per the convention's "each adopter declares its own default": bootstrap is a human-facing, first-time setup skill, so absent any signal it asks. An omitted `$mode` changes nothing in Phases 0-4.
- **quick** — `$mode: quick` is the explicit opt-in signal. Bootstrap **asks no questions** for any decision that has a safe default, so an empty repository reaches a **first workable story** in minutes rather than a full interview.
- **The resolution is the convention's, not bootstrap's.** Defaults resolve through the convention's cascade (explicit argument > project state > saved preferences > hardcoded fallback). Bootstrap declares only its per-adopter delta — which decision points are defaultable, which tier fills each, which are still asked — in [quick-mode-defaults.md](./quick-mode-defaults.md). There is **no bespoke** Quickstart resolution order.
- **Not every question disappears.** Decisions with no safe KB default (PM tool; tech stack on a genuinely empty repo) are still asked in quick mode — see [quick-mode-defaults.md](./quick-mode-defaults.md).
- **A populated PRD is a precondition, not a default.** Phase 0 is BLOCKING and identical in both depths: a missing or template PRD composes `/pair-process-specify-prd`, an interactive authoring session. That session is **outside** the quick-mode question budget and outside the minutes-scale claim — quick mode reaches a first workable story in minutes *from a populated PRD*. On a repo with no PRD, author it first (or expect the PRD interview before quick mode's own path starts).
- **Non-interactive safety**: guided needs a TTY. With no TTY (CI, piped stdin) guided can never run — bootstrap warns and runs quick instead, and never hangs waiting for input it cannot receive.
- **Already configured**: identical in both depths — every phase checks its own output first and confirms rather than overwriting.

## Phase 0: PRD Verification (BLOCKING)

### Step 0.1: Check PRD State

1. **Check**: Does [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) exist and is it populated (not a template)?
   - A file is a template if it contains `[Product/feature name]` or `[Creation date]`.
2. **Skip** (populated PRD): Extract project name and key constraints. Move to Phase 1.
3. **Act** (missing or template): Compose `/pair-process-specify-prd`.
   - Wait for PRD approval before proceeding.
4. **Verify**: PRD exists and is populated. If not → **HALT**.

### Step 0.2: Extract Key Constraints from PRD

1. **Act**: Read PRD and extract:
   - Target users and scale expectations
   - Budget and timeline constraints
   - Team size and technical skills
   - Compliance and integration requirements
   - Key features (P0/P1/P2)
2. **Verify**: Key constraints documented in session state.

## Phase 1: Project Categorization

### Step 1.1: Check Existing Categorization

1. **Check**: Does [adoption/decision-log/](../../../.pair/adoption/decision-log) contain a `*-project-categorization.md` file?
2. **Skip**: If categorization already recorded, read it and move to Phase 2.
3. **Act**: Proceed to categorization analysis.

### Step 1.2: Categorize Project

1. **Act**: Evaluate project indicators from PRD:
   - Team size and budget constraints
   - Scale expectations and performance needs
   - Compliance and integration complexity
   - Timeline pressures and market requirements

2. **Act**: Present categorization with evidence:

   > Based on PRD analysis, this project fits **[Type X]** categorization:
   > - **Type A (Pet/PoC)**: Small team (1-3), minimal budget, single user or small group, no compliance, fast iteration
   > - **Type B (Startup/Scale-up)**: Growing team (3-15), moderate budget, scaling users, some integrations, rapid growth
   > - **Type C (Enterprise)**: Large team (15+), significant budget, many users, compliance requirements, complex integrations
   >
   > Evidence: [specific PRD indicators]
   >
   > Does this categorization match your project?

3. **Act**: On confirmation, compose `/pair-capability-record-decision`:
   - `$type`: `non-architectural`
   - `$topic`: `project-categorization`
   - `$summary`: "Project categorized as Type [X] — [category name]"

4. **Verify**: Categorization decision recorded.

**Quick mode**: the confirmation question is skipped — the type is derived from the PRD signals above and recorded directly ([quick-mode-defaults.md](./quick-mode-defaults.md)).

## Phase 2: Checklist Completion

### Step 2.1: Check Existing Adoption Files

1. **Check**: Scan [adoption/tech/](../../../.pair/adoption/tech) for existing files. Classify each as populated or template:
   - `architecture.md`
   - `tech-stack.md`
   - `infrastructure.md` (optional — not all project types need it)
   - `ux-ui.md` (optional — not all project types need it)
   - `way-of-working.md`

2. **Skip**: Files that are already populated — do not re-generate.
3. **Act**: Build a checklist of missing or template files to complete.

### Step 2.2: Assessment Phase (Optional)

1. **Check**: Are assess-\* skills installed? Scan installed skills directory for `assess-*` skills.
2. **Act** (installed): Compose assess-\* skills in recommended sequence — see [assess-orchestration.md](./assess-orchestration.md) for the sequence, each skill's owned adoption-file section, and the parallel-safety/partial-installation rules. Each skill checks its own adoption file first — already-decided domains are skipped automatically (resolution cascade). **assess-\* skills are output-only**: each returns a proposal `{ content, target, decision-metadata }` and writes nothing. For each accepted proposal, `/pair-process-bootstrap` composes `/record-decision(content, target, decision-metadata)` — the **sole adoption writer** — to persist it. Never let an assess-\* skill write adoption directly.
3. **Act** (not installed): Warn and proceed with manual assessment:

   > assess-\* skills are not yet installed. Proceeding with manual assessment.
   > For each technical area, I'll reference the guidelines and ask you to make decisions directly.

4. **Verify**: Assessment data collected (via skills or manually) and persisted via `/pair-capability-record-decision`. All adoption files written from assess-\* proposals are consistent.

**Quick mode**: composed assess-\* skills must be invoked with their own quick signal — the resolution cascade's **Path A `$choice`**, resolved from project state — never plain, because the assess-\* family's declared default is guided (Path C, the full interview). **Path A's confirmation round is not run here**: the [resolution cascade](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/resolution-cascade.md) Path A steps 3-4 ask the developer to confirm the override, and each assess-\* skill declares its own prompt for it — eight composed skills would emit up to eight confirmations inside a depth that asks nothing. In quick mode the resolved `$choice` is accepted as-is and reported once in the Step 4.3 summary. This is a **disclosed per-adopter deviation**, like the explicit-`guided` no-op above; see [quick-mode-defaults.md](./quick-mode-defaults.md) § Disclosed deviations. A domain project state cannot resolve falls back to the per-project-type default named in [quick-mode-defaults.md](./quick-mode-defaults.md); the tech stack on a genuinely empty repo is the one exception and is still asked (Step 2.3). The manual-assessment path (item 3) asks nothing either — it takes the same defaults and reports them.

### Step 2.3: Gather Information per Section

For each missing adoption file, work through the relevant checklist section. Reference the [Bootstrap Checklist](../../../.pair/knowledge/assets/bootstrap-checklist.md) for section-specific questions.

1. **Architecture** — scale, integrations, compliance, patterns
   - Reference: [Architecture Guidelines](../../../.pair/knowledge/guidelines/architecture/README.md)

2. **Tech Stack** — languages, frameworks, libraries with versions
   - Reference: [Technical Standards](../../../.pair/knowledge/guidelines/technical-standards/README.md)

3. **Infrastructure** — deployment, CI/CD, monitoring, environments
   - Reference: [Infrastructure Guidelines](../../../.pair/knowledge/guidelines/infrastructure/README.md)

4. **UX/UI** — design system, accessibility, device support
   - Reference: [UX Guidelines](../../../.pair/knowledge/guidelines/user-experience/README.md)

5. **Way of Working** — processes, quality gates, release cycles
   - Reference: [Collaboration Guidelines](../../../.pair/knowledge/guidelines/collaboration/README.md)

**Rules**:

- Ask 3-4 focused questions per section
- Wait for developer responses before proceeding
- Record each significant decision via `/pair-capability-record-decision` (`non-architectural` → ADL, `architectural` → ADR)

**Quick mode**: no section questions — each section is resolved through the cascade (project state first, KB anchor only where the repository is silent — see [quick-mode-defaults.md](./quick-mode-defaults.md) § `Cascade tiers, as bootstrap fills them`), the named anchor being [Bootstrap Checklist](../../../.pair/knowledge/assets/bootstrap-checklist.md) § `Quick-Mode Per-Project-Type Defaults` (plus § `Decision Framework` for the core architectural pattern), with the same `/pair-capability-record-decision` calls. The § `Context-Specific Examples` are worked examples of already-decided projects — **never** a default source. The **testing** and **AI** sub-sections of `tech-stack.md` (separate assess-\* invocations — see [assess-orchestration.md](./assess-orchestration.md)) have their own rows in the same table; the test runner and the assistant follow from the resolved stack and project state, the strategy values from the table. Exception: an undetectable tech stack (empty repo, nothing to read from project state) is still asked; the table has no stack row by design ([quick-mode-defaults.md](./quick-mode-defaults.md)).

## Phase 3: Standards Generation

### Step 3.1: Generate Adoption Documents

For each missing adoption file (in order: architecture → tech-stack → infrastructure → ux-ui → way-of-working):

1. **Check**: Is this file already populated? If yes, skip.
2. **Act**: Generate the document following:
   - [Adopted Standards format](../../../.pair/adoption/tech/README.md) (if format guide exists)
   - Concise, prescriptive English
   - Specific versions and configuration details
   - References to KB guidelines for detailed rationale
3. **Act**: Present key decisions with rationale for developer review.
4. **Act**: Iterate on feedback until approved.
5. **Act**: Save to [adoption/tech/](../../../.pair/adoption/tech)`<filename>.md`.
6. **Verify**: File written, consistent with other adoption files.

**Quick mode**: steps 3 and 4 are skipped for **every** document — no per-document presentation, no approval round, no iteration loop. Documents are generated, written and then reported once in the Step 4.3 summary; steps 1, 2, 5 and 6 are identical in both depths ([quick-mode-defaults.md](./quick-mode-defaults.md)).

### Step 3.2: Quality Gate Setup

1. **Check**: Does [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) already contain a Custom Gate Registry with entries?
2. **Skip**: If quality gates already configured, move to **Phase 3.5** — never past it. Phases 3.5 and 3.6 are not part of gate setup: skipping to Phase 4 here would mean a re-run on a project whose registry is already populated silently does neither domain modeling nor the classification delta.
3. **Act**: Ask the developer:

   > **Quality gate setup:**
   > The standard pipeline includes: type checking, testing, linting, formatting.
   >
   > Do you want custom quality gates beyond the standard pipeline?
   > Examples: security scanning, bundle size checks, smoke tests, accessibility audits.
   >
   > If yes, describe the additional gates. If no, I'll configure the standard pipeline only.

4. **Act — ask for the review gate, when no decision exists**: check whether `way-of-working.md` already declares `Review enforcement`. If it does, honour it and say which way. If it does **not**, ask — never assume:

   > **Review gate:**
   > pair reviews every PR and publishes a verdict. Should that verdict be able to BLOCK a merge?
   >
   > - **no** (default) — the review runs and reports; nothing it says stops a merge.
   > - **yes** — `pair-review` and `pair-explicit-approval` become required checks, and a 🔴 PR
   >   additionally needs an approval from a human who is not the author. On a one-person
   >   repository that approval cannot be obtained at all, so a red PR would be unmergeable.
   >
   > Applying branch protection for those checks needs admin rights and stays a human step
   > either way.

   Record the answer as `Review enforcement: disabled|enabled`. **No answer, or quick mode ⇒ `disabled`** — the tier below has no project-state signal to read, and a default that blocks turns a fresh install into a repository nobody can merge into.

5. **Act**: For each quality gate (standard + custom):
   - Add entry to the Custom Gate Registry in `way-of-working.md` with: Order, Gate name, Command, Scope Key, Required flag, Description
   - Create placeholder script entries (in `package.json` scripts or technology-specific equivalent) so the gate infrastructure is executable from day one

6. **Act**: Record quality gate decisions via `/pair-capability-record-decision`:
   - `$type`: `non-architectural`
   - `$topic`: `quality-gate-setup`

7. **Verify**: Quality gates documented in way-of-working and placeholder scripts exist.

**Quick mode**: the custom-gate question is skipped — the standard pipeline only, written as the same registry entries and scripts guided mode would produce ([quick-mode-defaults.md](./quick-mode-defaults.md)).

## Phase 3.5: Domain Modeling (optional, full-catalog)

Runs after architecture and tech-stack are adopted (Step 3.1) — both are prerequisites for `/pair-capability-map-contexts`.

### Step 3.5.1: Subdomain Placement

1. **Check**: Is `/pair-capability-map-subdomains` installed? Does [`adoption/product/subdomain/`](../../../.pair/adoption/product/subdomain) already contain populated entries?
2. **Skip**: If not installed → warn and proceed to Step 3.5.2 without subdomain placement. If already populated → proceed to Step 3.5.2.
3. **Act**: Compose `/pair-capability-map-subdomains` with `$scope: all` — the only caller allowed a full-catalog run. Uses PRD (always present at this point); falls back to "system areas" if no initiatives exist yet.
4. **Verify**: Subdomain catalog created/updated, or fallback noted. Proceed regardless of outcome.

### Step 3.5.2: Bounded Context Placement

1. **Check**: Is `/pair-capability-map-contexts` installed? Does [`adoption/tech/boundedcontext/`](../../../.pair/adoption/tech/boundedcontext) already contain populated entries?
2. **Skip**: If not installed → warn and proceed to **Phase 3.6** without context mapping. If already populated → proceed to **Phase 3.6**.
3. **Act**: Compose `/pair-capability-map-contexts` with `$scope: all` — the only caller allowed a full-catalog run. Uses the subdomain catalog (Step 3.5.1) plus architecture.md and tech-stack.md (Step 3.1).
4. **Verify**: Bounded context catalog created/updated, or fallback noted. Domain modeling never blocks bootstrap completion — proceed to **Phase 3.6** regardless of outcome. **No exit path of this phase routes past Phase 3.6** — not the not-installed warning, not the already-populated skip, not this normal completion: Phase 3.6 proposes its rows from what was just mapped, so jumping over it would strand the phase that consumes this one's output.

**Quick mode**: both composed `map-*` skills carry their own **unconditional** developer-approval round (`/pair-capability-map-subdomains` Step 3 "Approve or adjust?", `/pair-capability-map-contexts` Step 4 the same), so composing them plainly would emit two more questions inside a depth that asks none — the same collision as the assess-\* family in Step 2.2, in a different surface. Quick mode therefore **accepts each proposed delta as-is** and reports the catalogs once in the Step 4.3 summary; every entry stays an ordinary adoption file the developer can edit afterwards. This is a **disclosed per-adopter deviation** — see [quick-mode-defaults.md](./quick-mode-defaults.md) § Disclosed deviations. **One exception survives**: `/pair-capability-map-contexts` HALTs on an unbalanced + volatile relationship offered with neither mitigation nor acceptance, and quick mode does **not** suppress that — accepting it silently would write a domain model recording a coupling risk nobody judged. That single gate is the one place Phase 3.5 can still ask in quick mode.

## Phase 3.6: Classification Delta (optional, opt-in)

Runs **after Phase 3.5**: the subdomains and bounded contexts just mapped are what the criticality rows are proposed *from*, so the developer confirms a list instead of inventing one. Earlier in the flow there is no domain model to read.

`tech/risk-matrix.md` holds up to three independent sections (quality-model §6). `## Tag Projection` is `/pair-capability-classify`'s own — it self-proposes that section on its first run (§5) and this phase **leaves it untouched**. The other two — `## Criticality Table` (§3.1) and `## Overrides` (§4) — have no guided authoring path anywhere else: this phase is it.

**Absence stays legitimate.** The file is optional by design: absent, classification resolves entirely from KB defaults and nothing fails (quality-model §6, D21). This phase exists to make the delta easy to author, **never to make it expected** — declining is a fully supported outcome, no Definition of Done may come to require these sections, and the offer says so out loud.

**Schema lives in the model, not here.** Both sections' shape is defined in the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) — §3.1 (the service/domain criticality dimension), §4 (per-tier reviewer count and SLA), §6 (the delta file itself) — with a filled-in example at [risk-matrix-example.md](../../../.pair/knowledge/assets/risk-matrix-example.md). This phase **never restates** either schema: a second copy would drift from the model that owns it.

**Write path**: this phase writes the confirmed sections itself, with the same **propose-then-write-if-confirmed** / config-registry pattern `/pair-capability-classify` uses for its `## Tag Projection` section (quality-model §5, `/pair-capability-classify` Step 5). That is registry state, not adoption *decision* content, so it **does not route through `/pair-capability-record-decision`** — exactly as `/pair-capability-classify`'s own section write does not.

**Interview style**: recommendation-first, **one recommendation at a time** (the `/pair-capability-grill` sync style, applied inline — the question set is fixed and short, so nothing is composed). With **no TTY** there is nothing to interview: bootstrap already downgrades to quick (see Resolution Depth), so the quick-mode behaviour of both steps below applies — nothing asked, nothing written.

### Step 3.6.0: Parse Precondition (whole phase)

Runs **before either step's presence check**, and gates the whole phase on both of its preconditions — because a heading is not a parse, and a delta needs a model to be a delta *of*. A `## Criticality Table` whose table is unreadable would otherwise satisfy Step 3.6.1's presence check, be reported `already authored`, and hand control to Step 3.6.2, which would then write into the very file this phase declared it does not trust.

1. **Check — model installed**: is the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) guideline present? It owns the schema of both owned sections (§3.1/§4/§6) and the criterion their values come from — this phase deliberately restates neither.
2. **Skip — model not installed**: ⇒ **skip the whole phase**, both steps, reporting `skipped — quality model not installed`, and **continue at Phase 4**. Never author a section against a schema that is not installed. This is the whole-phase gate, so the check lives here and not in each step.
3. **Check — parse**: `tech/risk-matrix.md` absent ⇒ nothing to distrust, continue to Step 3.6.1. Present ⇒ does it parse — readable tables, known keys, sections in the shape §6 defines?
4. **Skip — malformed**: unparseable table or unknown keys ⇒ **skip the whole phase**, both steps, reporting `skipped — file malformed`, and **continue at Phase 4** — the phase is optional and never blocks, so a distrusted file costs the delta, not the bootstrap. **Never rewrite** a file over a parse this phase does not trust — and note the write would also be silently inert: per §6 a malformed file falls back to KB defaults *entirely*, exactly as if it were absent, so confirmed entries written into it would resolve to nothing while appearing recorded.
5. **Act**: model installed and the file absent or parsing ⇒ continue to Step 3.6.1.
6. **Verify**: exactly one of three states holds — control is at Step 3.6.1 with the model installed and the file absent or parsing; or the phase was skipped whole with `skipped — quality model not installed`; or the phase was skipped whole with `skipped — file malformed` — both skips reported in the Step 4.3 summary with control at Phase 4. Nothing is written in any of the three: this precondition never touches the file.

### Step 3.6.1: Criticality Table (optional)

1. **Check**: does `tech/risk-matrix.md` already contain a `## Criticality Table` section? Presence only — Step 3.6.0 has already established that the file parses.
2. **Skip**: if it does, the table is already authored — **do not re-propose** it (idempotent, mirroring the §5 "skip if present" rule). Report `criticality: already authored` and move to Step 3.6.2.
3. **Act — build the candidate rows** (never a blank list):
   - **Phase 3.5 ran — the catalogs name the candidates, they do not define the key space.** The key is what the *read* side resolves a diff to: the **deployable that owns the touched files** — workspace package, app, or top-level path scope — which is how §6 keys this dimension. Every row is keyed by one of those and by nothing else. The mapped **bounded contexts supply the candidate names and the recommended value**, each mapped onto the deployable it lives in (a context spanning two deployables yields one row per deployable; two contexts inside one deployable yield one row, at the higher value); the mapped subdomains fill the gaps only — a subdomain a context already covers is offered **once, not twice**, and one key never produces two rows. Not mere tidiness: a key no diff resolves to is never read, and the deployable it meant to cover stays unlisted ⇒ conservative High (§6), so a near-miss key silently reds a dimension instead of being a harmless repeat.
   - **Recommending the value** — apply the H/M/L criterion §6 defines (**Choosing a value**: blast radius, user-facing exposure, data sensitivity, uptime expectation — and **not the subdomain class**, which §3.1 already spends on the Business impact dimension). This step **applies that mapping and never re-defines it**: one criterion, one owner, so the guided walk and hand-authoring from the example produce tables reasoned the same way. Each candidate carries its recommended value and the **reason** for it; the developer **confirms or edits**, and nothing is invented on their behalf.
   - **Phase 3.5 skipped, or its catalogs are empty**: degrade to the repository itself — workspace packages, deployables, top-level path scopes — as the candidate rows. Same key space, reached directly instead of through a catalog: one row per deployable, exactly what §6 says a diff resolves to. The **recommendation is unchanged**: §6's criterion reads blast radius, exposure, data sensitivity and uptime off the deployable itself, none of which needs a domain model — so these rows are offered in the same `recommended … because …` shape as any other, never as bare names.
   - **No distinct services or domains at all**: offer the whole project as a single scope. **An empty answer is a valid answer** — but say which "empty" it is: an empty answer writes **no section at all**, and *that* is what resolves to KB defaults (§6). A written-but-rowless `## Criticality Table` is the opposite — it is *an existing table* in which every service is unlisted, so every service resolves to conservative High. The section is therefore created **only when at least one row is confirmed**.
4. **Act — ask once whether to author the table at all**, before entering any row loop. Phase 3.5 is the only `$scope: all` entry point, so the candidate list is a full catalog and can be long: state how long it is, and state that it is a **list to prune, not a form to complete**:

   > **Service/domain criticality (optional).** I can propose `[N]` rows from `[your domain model | the workspaces in this repository]` — a list to prune, not a form to complete.
   > Recommended: skip. With no table this dimension resolves to the KB default for every service (quality-model §3.1), which is the state most projects stay in.
   >
   > Dropping a candidate is **not neutral**: with no table at all every service resolves to the KB default, but once the table exists a service **not listed in it resolves to conservative High** (§6) — every PR touching it then classifies red. So keep each row you care about at its real criticality, or skip the table entirely.
   >
   > Skip the table, author it, or see the `[N]` candidates and keep only some?

5. **Act — only if the developer opted in**: walk the rows they kept, **one recommendation at a time**. Pruned rows are never asked about again, so the number of prompts is whatever the developer chose to keep:

   > **`[row]`** — recommended `[recommended criticality]`, because `[reason]`.
   > Dropping it is not neutral either: once the table is written, this service is **unlisted**, and an unlisted service resolves to conservative **High** (§6) — red tier on every PR that touches it.
   >
   > Confirm this row, edit it, or drop it?

6. **Act — on confirmation**: write `## Criticality Table` into `tech/risk-matrix.md` in the shape the model defines (§6), carrying **only the confirmed rows**. **At least one confirmed row is the precondition for writing the section at all** — zero confirmed rows is a decline (item 7), not an empty section, because a rowless table is an existing table in which every service resolves to High. File absent ⇒ create it with only the confirmed sections — never a copy of the example asset. Any existing `## Tag Projection` is left untouched.
7. **Act — on decline or skip**: **nothing is written**. Classification degrades to KB defaults (quality-model §3.1, D21) and setup continues — this step never blocks. **This is the one deliberate divergence from the reused write path**: `/pair-capability-classify` records a declined `## Tag Projection` as `Active: none`, so its proposal is never asked again; here a decline is *not* recorded, because recording it would be writing something — and nothing-is-written is the constraint this phase is built on. The consequence is stated rather than hidden: idempotency below covers **authored** sections only, so a later bootstrap re-run offers the candidates again.
8. **Verify**: either the section exists with the confirmed rows, or nothing was written — and either way **this step's own** outcome (`criticality: N rows` / `declined` / `already authored`) is carried into its own slot of the Step 4.3 summary line, independently of Step 3.6.2's.

**Quick mode**: this step **asks nothing and writes nothing** — no safe default exists for a project's criticality map, so the resolved default is "no delta, KB defaults apply"; the skip is reported once in the Step 4.3 summary ([quick-mode-defaults.md](./quick-mode-defaults.md)).

### Step 3.6.2: Overrides (optional)

1. **Check**: does `tech/risk-matrix.md` already contain an `## Overrides` section? Presence only — Step 3.6.0 has already established that the file parses.
2. **Skip**: present ⇒ already authored, and **never re-proposed**. Report `overrides: already authored` and move to Phase 4.
3. **Act — threshold overrides** (§3.1), asked on their own, one recommendation at a time. Recommend the KB default:

   > **Threshold overrides (optional).**
   > Any path or threshold that should always classify higher than its size suggests — a shared package whose every change is at least yellow, say?
   > Recommended: none. The KB thresholds (§3.1) then apply unchanged.
   >
   > Add a threshold override, or keep the KB thresholds?

4. **Act — per-tier reviewer count / SLA overrides** (§4), asked **separately**, only after the previous answer is recorded. Recommend the KB default, and say what these actually bind — substituting the `Review enforcement` value Step 3.2 recorded into the quote — render it, **never assume it** — since `enabled` is a reachable outcome of that step's own question:

   > **Per-tier reviewer counts / SLAs (optional).**
   > Do the quality model's per-tier reviewer counts and SLAs (§4) match how this team really reviews — two reviewers at red, say?
   > Step 3.2 recorded `Review enforcement: [recorded value]`. With `disabled` these are what the review **reports** per tier: it still runs and publishes its verdict, but nothing is a required check. With `enabled`, `pair-review` and `pair-explicit-approval` are required checks and what you set here is **merge-binding** (quality-model §4).
   > Recommended: none. The KB per-tier defaults (§4) then apply unchanged.
   >
   > Add a reviewer/SLA override, or keep the KB defaults?

5. **Act — on confirmation** (either family, independently): write the confirmed entries into `## Overrides` in the key shape the model defines (§4/§6) — same write path as Step 3.6.1, same file, `## Tag Projection` untouched. One section carries both families; a run that confirms only one writes only that one's keys.
6. **Act — on decline**: nothing is written; the KB thresholds (§3.1) and the KB per-tier reviewer/SLA defaults (§4) apply. Never blocks.
7. **Verify**: **this step's own** outcome (`overrides: N` / `declined` / `already authored`) is recorded in its own slot of the Step 4.3 summary line, independently of Step 3.6.1's.

**Quick mode**: this step **asks nothing and writes nothing**, for the same reason as Step 3.6.1 — reported once in the Step 4.3 summary ([quick-mode-defaults.md](./quick-mode-defaults.md)).

## Phase 4: Finalization

### Step 4.1: Consistency Verification

1. **Act**: Re-read all adoption files:
   - [architecture.md](../../../.pair/adoption/tech/architecture.md)
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md)
   - [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)
   - infrastructure.md and ux-ui.md (if generated)
2. **Act**: Verify cross-document consistency:
   - Tech stack versions match architecture references
   - Way-of-working references correct tools from tech-stack
   - Infrastructure aligns with architecture patterns
3. **Act**: Fix any inconsistencies found.
4. **Verify**: The three checks above hold with no remaining mismatch — tech-stack versions match architecture references, way-of-working tooling matches tech-stack, infrastructure aligns with architecture. Any check still failing after the fix step above → retry that step once; if still unresolved, **HALT**: "Consistency check unresolved — report the specific mismatch to the developer."

### Step 4.2: PM Tool Configuration

1. **Check**: Is PM tool already configured in way-of-working.md?
2. **Skip**: If configured, confirm and move to Step 4.3.
3. **Act**: Compose `/pair-capability-setup-pm`. The skill handles tool selection, configuration, and ADL recording.
4. **Verify**: PM tool configured and recorded.

**Quick mode**: the PM tool has no safe KB default — it is **still asked** here unless project state already names one. If it can neither be resolved nor asked (no TTY) → **HALT**, naming the input to pass explicitly ([quick-mode-defaults.md](./quick-mode-defaults.md)).

### Step 4.3: Final Summary

1. **Act**: Present bootstrap completion summary to the developer for final approval:

   > **Bootstrap complete.** All adoption files generated and approved.
   > Review the summary below and confirm everything is correct.

2. **Verify**: Developer approves. If not → iterate on specific concerns.

**Quick mode**: the summary is printed but not gated on approval — every value it reports is a normal adoption file the developer can edit afterwards.

## Output Format

```text
BOOTSTRAP COMPLETE:
├── Mode:            [guided (default) | quick — N questions asked]
├── PRD:             [verified | created via /specify-prd]
├── Categorization:  [Type A | Type B | Type C] — [ADL path]
├── Adoption Files:
│   ├── architecture.md:    [generated | existing | skipped]
│   ├── tech-stack.md:      [generated | existing | skipped]
│   ├── infrastructure.md:  [generated | existing | skipped | n/a]
│   ├── ux-ui.md:           [generated | existing | skipped | n/a]
│   └── way-of-working.md:  [generated | existing | skipped]
├── Quality Gates:   [N gates configured — standard + custom]
├── Domain Model:    [subdomains: N | contexts: N | skipped — not installed]
├── Classification:  [criticality: N rows | declined | already authored], [overrides: N | declined | already authored] — or whole-phase [skipped — quick mode | skipped — file malformed | skipped — quality model not installed]
├── PM Tool:         [configured via /setup-pm | already configured]
├── Decisions:       [N decisions recorded (ADR: X, ADL: Y)]
└── Status:          [Complete | Partial — details]
```

## HALT Conditions

- **PRD missing or template and /pair-process-specify-prd fails** (Phase 0) — cannot bootstrap without product context
- **Project categorization rejected** (Phase 1, **guided only**) — developer must confirm before technical decisions; quick mode derives the type from PRD signals and records it without a confirmation round
- **Critical technical decision unresolved** (Phase 2) — cannot generate adoption files with gaps
- **Adoption file generation rejected** (Phase 3, **guided only**) — each document needs developer approval in the guided depth; quick mode writes without an approval round (Step 3.1), so this condition cannot arise there
- **Non-defaultable input unresolvable in quick mode** (Step 2.3, Step 4.2) — a decision with no safe KB default (PM tool, undetectable tech stack) that cannot be resolved from the cascade and cannot be asked (no TTY); report which input to pass explicitly, never guess it

On HALT: report the blocker clearly, propose resolution, wait for developer.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invoking `/pair-process-bootstrap` on a partially completed project is safe and expected — per-phase:

1. **PRD**: detects existing populated PRD, skips Phase 0.
2. **Categorization**: detects existing ADL entry for `project-categorization`, skips Phase 1.
3. **Adoption files**: checks each file individually — only generates missing/template files.
4. **Quality gates**: detects existing Custom Gate Registry entries, skips Step 3.2.
5. **PM tool**: detects existing configuration in way-of-working, confirms and skips.
6. **Decisions**: existing ADL/ADR entries are not re-created.
7. **Classification delta**: a phase-level parse precondition runs first (Step 3.6.0) — a malformed file skips the whole phase; otherwise `tech/risk-matrix.md` is checked section by section, and an existing `## Criticality Table` or `## Overrides` is reported as already authored and never re-proposed (Phase 3.6). **Authored sections only**: a *declined* offer is deliberately not recorded (unlike `/pair-capability-classify`, which writes `Active: none` on a declined `## Tag Projection`), since the phase's contract is that declining writes nothing — so a re-run offers the candidates again.

Phase completion is detected via output file existence — never re-does completed work.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill not installed → skip that phase/step with a warning, never blocks) and [record-decision contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md) (`/pair-capability-record-decision` not installed → proposals cannot be persisted, document manually) for the standard scenarios. Additional cases (bootstrap's per-phase optional dependencies):

- **assess-\* skills not installed**: Skip assessment phase, reference guideline files directly, ask developer for manual decisions **in guided mode only** — in quick mode the manual path asks nothing either, taking the same per-project-type defaults and reporting them (Step 2.2). Log: "assess-\* skills not installed — using manual assessment."
- **/specify-prd not installed**: HALT at Phase 0 if PRD is missing (a required dependency, not optional). Suggest creating PRD manually using how-to-01.
- **/setup-pm not installed**: Skip PM configuration in Phase 4. Warn: "PM tool not configured — /pair-capability-setup-pm not installed."
- **Bootstrap checklist asset not found**: Use Phase 2 section questions as fallback — they cover the same areas.
- **Adoption directory doesn't exist**: Create `adoption/tech/` and `adoption/decision-log/` on first write.
- **/record-decision not installed**: Adoption cannot be persisted automatically — assess-\* skills are output-only and never write adoption themselves. Warn: "/pair-capability-record-decision not installed — assess-\* proposals cannot be persisted. Write adoption files manually from the proposals and record decisions by hand."
- **/map-subdomains or /pair-capability-map-contexts not installed**: Skip the corresponding step in Phase 3.5 with a warning. Domain modeling never blocks bootstrap completion.
- **Quality model doc not installed** (Phase 3.6): the phase-level precondition (Step 3.6.0, first check) skips the phase with a warning, reported as `skipped — quality model not installed` in the Step 4.3 `Classification:` line (its third whole-phase value) — the model owns the schema of both sections, so there is nothing to author a delta against. Never blocks.
- **`tech/risk-matrix.md` present but malformed** (Phase 3.6): the phase-level parse precondition (Step 3.6.0) runs ahead of both steps' presence checks and skips the **whole phase**, reporting `skipped — file malformed` — the §6 resolution already warns and falls back to KB defaults entirely, so the file is neither rewritten over a parse the phase does not trust nor written into inertly.
- **No TTY (CI, piped stdin)**: guided cannot run — warn and run `$mode: quick` instead, never hang on input that cannot arrive. If a still-asked decision (PM tool, undetectable stack) is then unresolvable → **HALT**.

## Notes

- The developer can stop between phases; re-invoke to resume (see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md)).
- Phase 3.5 is the only full-catalog (`$scope: all`) entry point for `/pair-capability-map-subdomains` and `/pair-capability-map-contexts` — every other caller is scoped to what it just touched. See [Callers Matrix](../../../.pair/knowledge/skills-guide.md#callers-matrix-scoped-capabilities).
- Content source: how-to-02 Phases 0-4 (including domain modeling). How-to-02 retains orchestration flow, this skill has operational detail.
