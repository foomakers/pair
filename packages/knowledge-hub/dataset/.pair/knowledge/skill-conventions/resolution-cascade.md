# Resolution Cascade

The generic priority order a skill uses to decide **how much work it still needs to do**, before running its full algorithm: an explicit argument wins over existing adoption, which wins over a fresh assessment. Three paths, always evaluated in order, each following **check → skip → act → verify**.

## Path A — Argument Override

1. **Check**: Is the skill's override argument (typically `$choice`) provided?
2. **Skip**: If not provided, go to Path B.
3. **Act**: Confirm the override with the developer — surface any conflict with existing adoption before accepting it.
4. **Verify**: Developer confirms. Proceed to the skill's main algorithm (skip guideline-reading/assessment).

## Path B — Existing State Check

Two variants, depending on the skill's nature:

- **Decision skills** (the `assess-*` family): Path B checks whether the relevant **adoption file/section already exists and is populated**. If yes: read it, confirm it's still valid, check a corresponding decision record exists (ADR/ADL — see [record-decision-contract.md](record-decision-contract.md)), report a gap if missing, then exit — the resolution cascade **is** the idempotency mechanism for these skills (adoption already reflects the decision, so there's nothing left to assess).
- **Report/analysis skills** (e.g. an `analyze-*` skill): Path B checks whether a **recent output already exists** (report, prior analysis) instead of an adoption file. If found and not stale, confirm and exit; if stale or the developer requests it, proceed to Path C. This variant is the [idempotency convention](idempotency.md) applied at Step 1.

1. **Check**: Does the relevant existing state (adoption section, or recent report) exist and hold?
2. **Skip**: If not, go to Path C.
3. **Act**: Present the existing state; ask whether to keep it or redo.
4. **Verify**: If kept → exit skill. If redo requested (or state is stale/missing) → proceed to Path C.

## Path C — Full Assessment/Analysis

1. **Act**: Proceed to the skill's main algorithm (read guidelines, evaluate, produce the proposal or report).

## Per-skill delta (what stays in the skill, not here)

Only these vary per skill and belong in the skill's own `### Step 1: Resolution Cascade` section, right after the pointer to this file:

- Which adoption file/section (or which "existing output" signal) Path B checks against.
- The exact confirmation/HALT prompt wording for that domain.
- Which step number Path C proceeds to (depends on the skill's own algorithm layout).
