# Resolution Cascade

The generic priority order a skill uses to decide **how much work it still needs to do**, before running its full algorithm: an explicit argument wins over existing adoption, which wins over a fresh assessment. Three paths, always evaluated in order, each following **check → skip → act → verify**.

Paths A and B each end in an approval round. Both are qualified **here**, once, for every skill that follows this cascade — a skill inheriting them restates nothing and only qualifies its own local rounds. See [approval rounds](approval-rounds.md) for the `$approval` signal, its default (`interactive` — an omitted argument changes nothing) and the reporting obligation that survives `auto`.

## Path A — Argument Override

1. **Check**: Is the skill's override argument (typically `$choice`) provided?
2. **Skip**: If not provided, go to Path B.
3. **Act** (`$approval: interactive`): Confirm the override with the developer — surface any conflict with existing adoption before accepting it.
4. **Verify** (`$approval: interactive`): Developer confirms. Proceed to the skill's main algorithm (skip guideline-reading/assessment).

Under `$approval: auto` steps 3-4 are not asked: the override is **accepted as passed** — it is the caller's own explicit instruction, which outranks adoption by this cascade's precedence — and any conflict with existing adoption is **reported** in the skill's output instead of raised as a question.

## Path B — Existing State Check

Two variants, depending on the skill's nature:

- **Decision skills** (the `assess-*` family): Path B checks whether the relevant **adoption file/section already exists and is populated**. If yes: read it, confirm it's still valid, check a corresponding decision record exists (ADR/ADL — see [record-decision-contract.md](record-decision-contract.md)), report a gap if missing, then exit — the resolution cascade **is** the idempotency mechanism for these skills (adoption already reflects the decision, so there's nothing left to assess).
- **Report/analysis skills** (e.g. an `analyze-*` skill): Path B checks whether a **recent output already exists** (report, prior analysis) instead of an adoption file. If found and not stale, confirm and exit; if stale or the developer requests it, proceed to Path C. This variant is the [idempotency convention](idempotency.md) applied at Step 1.

1. **Check**: Does the relevant existing state (adoption section, or recent report) exist and hold?
2. **Skip**: If not, go to Path C.
3. **Act** (`$approval: interactive`): Present the existing state; ask whether to keep it or redo.
4. **Verify**: If kept → exit skill. If redo requested (or state is stale/missing) → proceed to Path C.

Under `$approval: auto` step 3 is not asked: the existing state is **kept** and reported — the conservative branch of the same question, since redoing would overwrite a recorded decision nobody was asked about. A state the check found **stale or missing** was never Path B's to keep, and proceeds to Path C as usual.

## Path C — Full Assessment/Analysis

1. **Act**: Proceed to the skill's main algorithm (read guidelines, evaluate, produce the proposal or report).

## Per-skill delta (what stays in the skill, not here)

Only these vary per skill and belong in the skill's own `### Step 1: Resolution Cascade` section, right after the pointer to this file:

- Which adoption file/section (or which "existing output" signal) Path B checks against.
- The exact confirmation/HALT prompt wording for that domain.
- Which step number Path C proceeds to (depends on the skill's own algorithm layout).

What does **not** vary, and must not be restated per skill: the `$approval` qualification of Paths A and B above. A skill declares the `$approval` argument (so a caller can pass it) and qualifies the rounds Path C's own algorithm adds — never these two.
