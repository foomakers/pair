# Output Format Shapes

Two named ASCII shapes formalize what the `assess-*`/`analyze-*` family already produces de facto and identically. This is documentation of an existing convention — no skill's output logic changes; a new skill in either family inherits the right shape by reference instead of re-deriving one.

## Decision Shape

Used by the 8 **decision** skills — `assess-ai`, `assess-architecture`, `assess-infrastructure`, `assess-methodology`, `assess-observability`, `assess-pm`, `assess-stack`, `assess-testing`. Each proposes a choice to be persisted via [`/record-decision`](record-decision-contract.md).

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    [assessment domain, e.g. Architecture, Testing]
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [the recommended choice, in domain-specific terms]
├── Proposal:  [content rendered for <target file/section>]
├── Target:    <adoption file path> (<owned section>)
├── Persist:   [caller composes /record-decision(content, target) → ADR|ADL]
├── Approval:  [interactive — approved | auto — accepted as-is | auto — existing kept, delta not applied | auto — UNRESOLVED, no proposal]
└── Status:    [Proposal ready | Confirmed existing | Unresolved — no proposal]
```

The `Approval` line is how a non-interactive caller reads **which** of `auto`'s outcomes it got ([approval rounds](approval-rounds.md)) — including the one that is not a decision: a call the skill cannot make alone yields no proposal, and a caller that cannot see that in the return value has to infer it from an absent field. `Status: Unresolved` is its counterpart, so the outcome is legible in both lines.

Per-skill delta: the `Domain` label, the `Decision`/`Proposal`/`Target` line contents, and the ADR-vs-ADL choice in `Persist`. `assess-stack` additionally carries a `Mode` line (Bootstrap | Implementation | Review) and a wider `Status` set (adds Approved | Rejected) because it spans the whole project lifecycle, not just bootstrap. `assess-stack` also ends its `Approval` line with **`auto — UNRESOLVED, handed back to the caller`** instead of the canonical `no proposal`, because in review mode the unresolved judgement (an unlisted dependency to approve or reject) belongs to the caller that asked — there is no proposal to withhold, so "handed back" is what actually happens. `assess-pm` additionally carries a `Delegated` status because it may hand persistence to `/setup-pm`. All three are legitimate deltas, not shape violations.

`assess-security` is **not** a Decision Shape skill despite carrying an `Approval` line of its own: its block is `SECURITY AUDIT COMPLETE`, with mode-specific rows and its own values. The membership list above is the authority — eight skills — and a skill acquiring an `Approval` line does not join it.

## Report Shape

Used by the 2 **report** skills — `analyze-debt`, `analyze-code-quality`. Each returns findings for the caller to read; neither proposes an adoption change or persists anything.

```text
<REPORT TITLE> (output-only — no files [or issues] created):
├── <metric/summary line 1>
├── <metric/summary line 2>
...
└── <summary line N>

<ITEMS/HOTSPOTS SECTION>:
1. [item] — [detail] — [recommendation or scoring]
2. ...

<RECOMMENDATIONS SECTION> (when applicable):
1. [priority] [action]
2. ...

RESULT: [one-line outcome — report only, nothing created/blocked]
```

Per-skill delta: the metrics collected (debt counts by category/severity vs. complexity/size/coverage/duplication/maintainability), the items-section framing (prioritized debt items vs. hotspots), and whether a distinct recommendations block is present.

## Choosing a shape for a new skill

- Proposes a choice for `/record-decision` to persist → **Decision Shape**.
- Returns findings/metrics with no adoption proposal → **Report Shape**.
- Neither fits → don't force one; a genuinely different skill kind gets its own Output Format, not a bent version of these two.
