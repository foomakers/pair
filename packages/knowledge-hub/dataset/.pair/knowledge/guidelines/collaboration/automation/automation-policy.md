# Automation Policy — `tech/automation.md`

How much of the delivery flow a project lets run **unattended** is a project decision, so it lives in an adoption file: the optional `.pair/adoption/tech/automation.md`. This guideline defines that file's schema.

Today it specifies exactly one section — **`## Eligibility`**, which selects **which cards** an unattended run may pick up at all. Everything else the automation loop needs (which gates must be green to auto-advance, the stop predicate and step defaults, `max_parallelism`, the audit location — ADR-017 §6) is **out of scope here** and arrives with the loop that consumes it (#250). Sections are owned one at a time so two stories never claim the same lines of the same file.

**Eligibility selects `which cards`, never which gates.** The per-tier gate/approval policy already exists in [`quality-model.md`](../../quality-assurance/quality-model.md) §4 and is not restated here — auto-advance *enacts* that policy, it does not redefine it. Two sources of truth for the same rule is the failure mode this split exists to prevent.

## The declaration

```markdown
## Eligibility

risk:green
```

That is the whole schema: a heading and **a single literal label**.

- **Exactly one label.** Not a list, not an expression. `pair-next --filter` — the query every consumer ultimately runs — takes one label string and matches it with plain **string equality** against each issue's labels; there is **no AND/OR/NOT grammar**. That matching rule is owned by `pair-next`'s own `SKILL.md` (`--filter <tag>` — generic tag match) and is **referenced here, never restated**, so the two cannot drift apart.
- **Consumers pass the declared string verbatim.** An automation consumer reads the label out of the adoption file and hands it to `pair-next --filter` unchanged — no parsing, no interpretation, no expansion. Which means **no classification tag name is ever hardcoded in a skill or a module** (D18): the label is adoption data, and the code that carries it stays tag-agnostic.
- **No dedicated eligibility tag** (ADR-013 Q2b). Eligibility is a *filter over the classification tags `classify` already emits*, not a tag family of its own. Nothing new is ever written onto a card to make it eligible.

## Recommended default — `risk:green`

The KB's **recommended default** is `risk:green`: only the lowest risk tier is ever developed unattended.

`risk:yellow` and `risk:red` cards **never match** it — plain string equality, no tier arithmetic — so business-critical work is **never auto-developed**, by construction rather than by a guard someone has to remember to write.

Two caveats belong to the default, and both are properties of the projection, not of this file:

- **Tag projection has to be on.** The filter only selects something when `## Tag Projection` in [`tech/risk-matrix.md`](../../quality-assurance/quality-model.md#6-techrisk-matrixmd--adoption-delta) actually emits that label family — `Active: risk`. With `Active: none`, or with the projection proposal never answered, no card carries a `risk:*` label at all, so the filter matches nothing and **nothing is eligible**. That is expected behaviour, not an error: the matrix is still computed and written to every story and PR body, it is simply not projected onto labels.
- **A renamed family must be named as emitted.** A project may rename `risk` to something else in its Tag Projection declaration (e.g. `priority`). Because matching is string equality against the **emitted** label, the declaration must then read `priority:green` — writing `risk:green` there would silently match nothing.

## Fail-safes

Both of the following are **MUST** rules for any consumer of this declaration. Neither has a "helpful" fallback: an automation policy that widens itself when it cannot read its own configuration is the one failure mode that puts business-critical cards into an unattended pipeline.

### Absent file, or absent section ⇒ empty eligibility set

`tech/automation.md` is **optional** — the same optional-adoption-file pattern as `tech/risk-matrix.md` (D21). Its absence is a valid, documented state and **never an error**.

When the file is absent, or present with no `## Eligibility` section, a consumer **MUST treat the eligibility set as empty**: no card is eligible, automation is off. It **MUST NOT** fall back to `all cards`, and MUST NOT substitute the recommended default on the project's behalf — a default nobody declared is not a decision.

### Not exactly one label ⇒ HALT

A value that is not exactly one label — empty, several labels, or one carrying a boolean operator (`AND` / `OR` / `NOT`, which the filter cannot express) — is a **broken adoption file**, not a policy.

The consumer **MUST HALT** with an **adoption-fix message** naming the file and the offending value, e.g.:

> `.pair/adoption/tech/automation.md` — `## Eligibility` declares `risk:green, risk:yellow`, but the declaration takes exactly one label. Fix the adoption file, then re-run.

It **MUST NOT** degrade to `all eligible`, and **MUST NOT** silently pick one operand of a value it could not parse.

## Re-evaluation — every run, never cached

The declaration and the labels it matches are **re-read and re-matched on every run and every step**, and the resulting selection is **never cached**. This is the same statelessness `pair-next` already guarantees for `--root`/`--filter` ("selection is never cached"), inherited rather than re-specified.

The consequence is that a card whose `risk:*` label changes between runs — a review raising the tier, say — drops out of the eligible set at the very next evaluation, with **no cache-invalidation step to remember**.

An **untagged** card — one carrying no `risk:*` label at all — never matches `risk:green`, again by plain label equality. So work that was never classified is never eligible: fail-safe, and consistent with ADR-013's untagged ⇒ 🔴 posture.

## What this declaration does not encode

| Question | Answered by |
| --- | --- |
| Which gates must be green before a card auto-advances? | [`quality-model.md`](../../quality-assurance/quality-model.md) §4 — per-tier requirements (D10). Not restated here |
| Is the card Ready / in the right state? | The consumer's own selection rules (`pair-next`). Eligibility is a **label** predicate only; state and readiness gating stay where they already live |
| Stop predicate, step defaults, `max_parallelism`, audit location | ADR-017 §6 — the remaining sections of `tech/automation.md`, owned by the automation loop story (#250) |
| Which label a card carries | `classify`, via the Tag Projection declaration in `tech/risk-matrix.md` |

## Related

- [Quality Model](../../quality-assurance/quality-model.md) — the classification matrix, tier resolution, per-tier requirements (§4), tag projection (§5) and the `tech/risk-matrix.md` adoption delta (§6)
- [Collaboration Automation Framework](README.md) — the surrounding automation guidelines
