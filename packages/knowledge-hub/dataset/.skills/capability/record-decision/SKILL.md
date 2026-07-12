---
name: record-decision
description: "Records an architectural, non-architectural, or domain decision and is the SOLE writer of adoption files. Architectural decisions produce an ADR; non-architectural decisions produce an ADL entry; domain decisions meeting the 3-criteria gate produce a DDR and sync the context map. All always update the relevant adoption/context files. Accepts pre-rendered {content, target} from assess-* proposals (generic persister — no per-domain rendering). Invocable independently or composed by /implement and /review."
version: 0.5.0
author: Foomakers
---

# /record-decision — Decision Recorder

Record a decision as an ADR (architectural), ADL (non-architectural), or DDR (domain). Always update the corresponding adoption files — or, for DDR, the context map — to keep them as the single source of truth for "what we use now."

This skill is the **sole generic writer of adoption files** (assess-* are output-only and delegate persistence here); the one exception is `/setup-pm`, which owns PM-tool configuration end-to-end — it writes the PM section of `way-of-working.md` itself, then composes this skill only for the decision record. When a caller supplies pre-rendered `$content` and a `$target`, this skill acts as a **generic persister** — it writes `$content` into its owned section of `$target` (a heading-scoped merge) and records the decision, with **no per-domain rendering logic** (each `assess-*` knows how to render its own adoption content; this skill only persists it).

## Arguments

| Argument   | Required | Description                                                                      |
| ---------- | -------- | -------------------------------------------------------------------------------- |
| `$type`    | Yes      | Decision type: `architectural`, `non-architectural`, or `domain`                |
| `$topic`   | Yes      | Short kebab-case topic name (e.g., `streaming-downloads`, `refund-window-30-days`) |
| `$summary` | No       | One-line summary of the decision (will be asked interactively if omitted)        |
| `$content` | No       | Pre-rendered adoption content (e.g. from an `assess-*` proposal). When provided with `$target`, this skill persists it into that target's owned section (a heading-scoped merge; generic persist) instead of re-deriving the affected files. |
| `$target`  | No       | Adoption file/section the `$content` is written to (e.g. `adoption/tech/tech-stack.md`). Required when `$content` is provided. |

## Core Rule: ADR, ADL, and DDR Are Mutually Exclusive

- **Architectural decision** → ADR file + adoption update. Never ADL or DDR.
- **Non-architectural decision** → ADL file + adoption update. Never ADR or DDR.
- **Domain decision** (meeting the 3-criteria gate) → DDR file + context map sync. Never ADR or ADL.
- **Adoption/context update is always required** regardless of decision type.
- Adoption files/context map = "what we use now." ADR/ADL/DDR = "why we decided."

## Algorithm

### Step 1: Classify Decision Type

1. **Check**: Is `$type` provided? If yes, use it.
2. **Act**: If not provided, ask the developer:

   > Is this decision **architectural** (affects system structure, patterns, service boundaries, quality attributes), **non-architectural** (library choice, convention adoption, tooling preference), or **domain** (a business rule, term, or behavior)?

3. **Act**: If `domain` was chosen or is a candidate, run **Step 1b: DDR Criteria Gate** before finalizing.
4. **Act**: If ambiguous between architectural and domain, ask: "Does this change the system's structure/boundaries (→ ADR), or a domain rule/behavior (→ DDR)?"
5. **Verify**: Decision type is set to `architectural`, `non-architectural`, or `domain`.

### Step 1b: DDR Criteria Gate (only when type is `domain` or a candidate)

A domain decision only becomes a DDR if it meets **all three** criteria. This is a gate, not a preference.

1. **Check**: Evaluate the candidate against each criterion:
   - **Hard to reverse**: Changing it later requires significant rework or has a high switching cost.
   - **Surprising without context**: A newcomer would not infer this outcome from the code/model alone.
   - **Real trade-off**: A real alternative existed and was consciously rejected.
2. **Act**: If **all three** hold → proceed as `domain` (DDR). If **any** fails → recommend recording it instead as an ADL (`non-architectural`) or, if too minor for even that, as an inline context-map note (no decision file) — ask the developer which they prefer.
3. **Verify**: Type is confirmed as `domain` only when all three criteria are satisfied and evidence for each is captured for the Context section.

### Step 2: Detect Existing Decision

1. **Check**: Search for existing decision files matching `$topic`:
   - If `architectural`: scan [adoption/tech/adr/](../../../.pair/adoption/tech/adr/) for files containing `$topic` in filename.
   - If `non-architectural`: scan [adoption/decision-log/](../../../.pair/adoption/decision-log/) for files containing `$topic` in filename.
   - If `domain`: scan [adoption/product/ddr/](../../../.pair/adoption/product/ddr/) for files containing `$topic` in filename.
2. **Skip**: If no existing file found, proceed to Step 3 (create new).
3. **Act**: If existing file found, ask the developer:

   > Found existing decision: `[filename]`. Do you want to **update** this decision or **create a new one**?

   - **Update**: Read existing file, present current content, proceed to Step 4 with update mode.
   - **Create new**: Proceed to Step 3 with create mode (for cases where the topic evolved into a distinct decision).
4. **Verify**: Mode is set to `create` or `update`.

### Step 3: Write Decision File

**File naming**:

- ADR: `adr-NNN-<topic>.md` (sequential, zero-padded 3-digit number, kebab-case slug, one file per decision).
- ADL: `YYYY-MM-DD-<topic>.md` (today's date, one file per decision).
- DDR: `ddr-NNN-<topic>.md` (sequential, zero-padded 3-digit number, kebab-case slug, one file per decision).

#### If `architectural` → ADR:

1. **Check**: Does [adoption/tech/adr/](../../../.pair/adoption/tech/adr/) directory exist?
2. **Act**: If not, create it.
3. **Check**: Determine the next sequence number — scan existing `adr-NNN-*.md` files, take the highest `NNN`, increment by 1 (zero-padded to 3 digits). If none exist, start at `001`.
4. **Act**: Create (or update) the ADR file at [adoption/tech/adr/](../../../.pair/adoption/tech/adr/)`adr-NNN-<topic>.md` following the standalone [ADR template](../../../.pair/knowledge/guidelines/collaboration/templates/adr-template.md). Fill in all sections: Status, Date, Context, Options Considered, Decision, Consequences, and Adoption Impact.
5. **Verify**: ADR file exists with complete content following the template structure, and sequential numbering is unbroken.

#### If `non-architectural` → ADL:

1. **Check**: Does [adoption/decision-log/](../../../.pair/adoption/decision-log/) directory exist?
2. **Act**: If not, create it.
3. **Act**: Create (or update) the ADL file at [adoption/decision-log/](../../../.pair/adoption/decision-log/)`YYYY-MM-DD-<topic>.md` following the standalone [ADL template](../../../.pair/knowledge/guidelines/collaboration/templates/adl-template.md). Fill in all sections: Date, Status, Category, Context, Decision, Alternatives Considered, Consequences, and Adoption Impact.
4. **Verify**: ADL file exists with complete content following the template structure.

#### If `domain` → DDR:

1. **Check**: Does [adoption/product/ddr/](../../../.pair/adoption/product/ddr/) directory exist?
2. **Act**: If not, create it — this initializes sequential numbering for the project.
3. **Check**: Determine the next sequence number — scan existing `ddr-NNN-*.md` files, take the highest `NNN`, increment by 1 (zero-padded to 3 digits). If none exist, start at `001`.
4. **Act**: Create (or update) the DDR file at [adoption/product/ddr/](../../../.pair/adoption/product/ddr/)`ddr-NNN-<topic>.md` following the standalone [DDR template](../../../.pair/knowledge/guidelines/collaboration/templates/ddr-template.md). Fill in all sections: Status, Date, Context (including the 3-criteria evidence from Step 1b), Decision, Consequences, and Context Map Impact.
5. **Act**: If this DDR supersedes a previously registered rule, set the predecessor DDR's Status to `Superseded by ddr-NNN-<topic>` and reference the predecessor DDR in the new file's Context/Decision.
6. **Verify**: DDR file exists with complete content following the template structure, sequential numbering is unbroken, and any supersede link is recorded on both files.

### Step 4: Update Adoption Files or Context Map

This step is **always required** — adoption files and the context map are the single source of truth. This skill is the sole generic writer of adoption files; the one exception is `/setup-pm` for the PM-tool section of way-of-working.md (see the overview).

#### If `$content` and `$target` provided → Generic Persist (assess-* proposal):

1. **Check**: Did the caller supply pre-rendered `$content` and a `$target`? (This is the `assess-* → record-decision` path.)
2. **Skip**: If not, fall through to the interactive identification below.
3. **Act**: Write `$content` into its owned section of `$target` (a heading-scoped merge): replace that section's body while preserving every sibling section the content does not own. Perform **no per-domain rendering** — the content is authored by the assess-* skill; this skill only persists it.
4. **Verify**: `$target` reflects the supplied content. Proceed to Step 5.

#### If `architectural` or `non-architectural` (interactive) → Update Adoption Files:

1. **Check**: Identify which adoption files are affected by this decision:
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) — if the decision involves libraries, frameworks, or tools
   - [architecture.md](../../../.pair/adoption/tech/architecture.md) — if the decision involves architectural patterns, boundaries, or infrastructure
   - [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — if the decision involves process, workflow, or tooling conventions
   - Other adoption files as relevant
2. **Act**: For each affected adoption file:
   - Read current content.
   - Add or update the relevant entry to reflect the decision.
   - Preserve existing content — only add/modify the affected section.
3. **Verify**: Each updated adoption file reflects the current state of facts.

#### If `domain` → Context Map Sync:

1. **Check**: Does `adoption/product/context-map.md` exist? If the affected subdomain has already split into its own file, check for `adoption/product/subdomain/<slug>.context.md` instead and prefer it.
2. **Act**: If no context file exists at all, offer to create a minimal `context-map.md` containing just the affected rule/term (a title and one entry) — warn the developer this is the project's first domain-context artifact.
3. **Act**: Update the current-state entry for the affected rule/term so it matches the DDR's Decision section exactly.
4. **Act**: If this DDR supersedes a previously registered rule, replace the old rule's entry — the context file must reflect only the new rule, never both.
5. **Verify**: The context file's affected entry is textually consistent with the DDR's Decision section. DDR (history/why) and context map (current state) are never allowed to diverge.

### Step 5: Consistency Check

1. **Check**: Re-read the decision file (ADR, ADL, or DDR) and all updated adoption files or the context map.
2. **Act**: Verify that every claim in the decision file is reflected in adoption/context, and vice versa.
3. **Verify**: If inconsistency found, report to developer and propose correction.

## Output Format

```text
DECISION RECORDED:
├── Type:     [Architectural (ADR) | Non-architectural (ADL) | Domain (DDR)]
├── File:     [path to decision file]
├── Mode:     [Created | Updated]
├── Adoption: [list of updated adoption files, or updated context file for DDR]
└── Status:   [Consistent | Inconsistency detected — details]
```

## Composition Interface

When composed by `/implement` or `/review`:

- **Input**: The composing skill detects a decision need and invokes `/record-decision` with `$type` and `$topic`.
- **Output**: Returns the path to the decision file and list of updated adoption/context files.
- The composing skill includes the decision file in the next commit.

When composed by `/bootstrap` or an `assess-*` proposal (generic persist):

- **Input**: The caller passes `$content` (the rendered adoption body from an `assess-*` skill) and `$target` (the adoption file/section), plus `$type`, `$topic`, `$summary`.
- **Output**: This skill writes `$content` into its owned section of `$target` (a heading-scoped merge) and records the ADR/ADL — it is the **sole generic adoption writer**. It performs no per-domain rendering; the assess-* skill owns the content.
- This keeps the invariant: **only `record-decision` writes adoption files generically** (the sole exception is `/setup-pm`, which writes the PM section of `way-of-working.md` directly); **only assess-* renders** its own adoption content; the caller orchestrates the two.

When invoked **independently**:

- Interactive: asks for type, topic, and summary if not provided as arguments. For `domain`, runs the criteria gate before writing anything.
- Writes files and reports results. Developer commits the changes.

## Edge Cases

- **Same topic + same date (ADL)**: If a file `YYYY-MM-DD-<topic>.md` already exists and the developer chose "create new," append an incremented suffix: `YYYY-MM-DD-<topic>-2.md`.
- **Same topic (DDR)**: Sequential numbering already guarantees a distinct filename (`ddr-NNN-<topic>.md`) — no suffix needed even if the same topic recurs.
- **Adoption file doesn't exist**: Create it with the decision content as the initial entry. Warn the developer that a new adoption file was created.
- **Context map absent (DDR)**: The DDR is still recorded; the skill offers to create a minimal `context-map.md` with just the affected rule (see Step 4).
- **Ambiguous type (ADR vs DDR)**: Domain-behavior impact → DDR; system-structure impact → ADR. Ask the developer when unclear.
- **Domain candidate fails the 3-criteria gate**: Recommend ADL or an inline context-map note instead of a DDR (Step 1b) — never force a DDR through.
- **Decision supersedes another**: Set the old decision's status to "Superseded by [new file]" and the new decision references the old one. For DDR, also update the context map so it reflects only the new rule (Step 4).

## Graceful Degradation

- If [ADR template](../../../.pair/knowledge/guidelines/collaboration/templates/adr-template.md) is not found, use the minimal ADR structure: Status, Date, Context, Decision, Consequences, Adoption Impact.
- If [ADL template](../../../.pair/knowledge/guidelines/collaboration/templates/adl-template.md) is not found, use the minimal ADL structure: Date, Status, Context, Decision, Consequences, Adoption Impact.
- If [DDR template](../../../.pair/knowledge/guidelines/collaboration/templates/ddr-template.md) is not found, use the minimal DDR structure: Status, Date, Context, Decision, Consequences, Context Map Impact.
- If adoption directories don't exist, create them and warn: "Created adoption directory — this appears to be a new project."
- If neither `context-map.md` nor a matching `<slug>.context.md` exists for a DDR, offer to create a minimal `context-map.md` containing just the affected rule/term — warn the developer this is the project's first domain-context artifact.

## Notes

- ADR, ADL, and DDR are mutually exclusive. Never write more than one for the same decision.
- Adoption files (ADR/ADL) and the context map (DDR) are always updated. A decision without that sync is incomplete.
- Date-based naming (`YYYY-MM-DD-`) ensures ADL sortability; sequential naming (`adr-NNN-`/`ddr-NNN-`) makes ADR and DDR supersede chains and cross-references (e.g., brainstorm conflict flags) easy to cite by number.
- The DDR criteria gate (Step 1b) exists to keep `adoption/product/ddr/` reserved for decisions worth their own historical record — everything else is an ADL or an inline note.
- This skill modifies files: decision files and adoption files, or the context map. All changes should be committed together.
