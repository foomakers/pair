# Decision: An approved `extend-current-card` delta is refused outright when the card speaks none of the recognized AC formats — fail-closed, never appended

## Date

2026-09-10

## Status

Active

## Category

Process Decision

## Context

`apply-scope-decisions` (US-479 S5, T-22) applies a maintainer's approved `extend-current-card`
delta mechanically: each approved `(AC id, description)` either **replaces** the obligation already
carried under that exact id, or is **added** as a genuinely new one. Resolution runs against
`cycle-state.mjs`'s `parseAcCard`, which recognizes exactly the adopted card dialects — the colon
convention (`AC-1: text`, `- **AC-1**: text`), story #479's checkbox convention
(`- [ ] **AC-01 — Title.** Description.`, and the title-less shape the script emits itself), and the
delivery template's numbered `**Given** / **When** / **Then**` blocks. It is deliberately not a
universal Markdown parser.

That leaves a third outcome the implementation had to name: a card in which the parser recognizes
**no** obligation at all (`dialect: 'unknown'`). Until now it was treated as an empty card — the
approved AC was appended under a `## Scope extension (US-479 S5)` heading — with one guard: if the
requested id happened to appear somewhere in the body, the operation was refused as
`ac-id-unresolvable`. That guard depends on a **textual coincidence**. A card whose acceptance
criteria are written as a table, a definition list, a numbered prose list, or in any other shape the
parser does not read, and whose obligations are not labelled with the requested id token, was
indistinguishable from a card with no acceptance criteria at all.

The failure this permits is the same one Finding 6 was opened for: a second, potentially
contradictory definition of an obligation the card already carries, written under an
authoritative-looking heading, and reported as a successful `extended`.

## Decision

**`extendCard` fails closed on `dialect: 'unknown'`.** When `parseAcCard` recognizes no obligation
in any adopted dialect, the operation is refused **before any write**, with the typed error
`unsupported-card-format`, regardless of whether the requested id appears in the body:

- no `gh issue edit` is issued and the card stays byte-identical;
- no decision handoff is published, so the proposal keeps `status: pending` and `scopeEpoch` is not
  incremented;
- the maintainer sees an explicit typed refusal, not a silent success.

**The absence of an id token is not evidence that a card carries no obligations** — only that this
parser cannot read the ones it has. The refusal is scoped to the card, not to the id: a card that
*does* speak a recognized dialect keeps the existing, narrower behaviour — an id it cannot match
while others resolve is `ac-id-unresolvable:<id>`, and a genuinely new id is still added in the
shape that card already uses.

## Alternatives Considered

- **Keep the id-mention heuristic** (refuse only when the requested id appears unresolved in the
  body): rejected — it makes a safety property depend on whether the human happened to spell the
  same id in the card, which is exactly the coincidence Finding 6's remediation was told not to
  rely on ("un mancato match NON dimostra che l'AC sia nuovo").
- **Widen the parser until any card is readable** (a general Markdown/AC extractor): rejected —
  explicitly out of scope for this remediation, and it converts a refusal that costs one retry into
  an open-ended guessing surface, where a wrong guess writes a contradictory obligation onto a real
  card.
- **Append but flag the result for human review**: rejected — the write has already happened by the
  time anyone reads the flag, and a contradictory AC pair on a live card is precisely the state the
  fix exists to prevent.

## Consequences

- A maintainer whose card is in an unsupported shape gets `unsupported-card-format` and must either
  restate the AC section in an adopted dialect or use the `new-card` action. This is one explicit
  retry, and it is the intended cost.
- A card with **no acceptance criteria at all** can no longer be extended by this action. This is
  accepted: the two cases are not distinguishable from the body alone, and the safe reading is the
  refusal.
- Coverage of the previously-accepted case is preserved as a **negative** test (`original card body
  for #42` + `AC-99` ⇒ refused, nothing written). The positive DT-16 test that used that body now
  seeds a card with an existing AC in a supported dialect; every assertion it made — real write,
  real readback, prior AC untouched, `scopeEpoch` bumped exactly once, targeted remediation round,
  idempotent replay — is unchanged.
- Nothing else in the resolution contract moves: supported dialects, exact full-token id matching
  (`AC-1` vs `AC-10`), duplicate-id ambiguity within and across dialects, the Given/When/Then shape
  requirement and the semantic readback all behave as before.

## Adoption Impact

- [ADR-024](../tech/adr/adr-024-delivery-phases-are-skills.md) — Amendment 2026-09-10 (f) records
  this rule and corrects amendment (e)'s description of the unrecognized-card case.
- No change to `way-of-working.md` or to the scope-decision protocol itself: the maintainer's three
  actions, the authentication and the baseline hash are untouched.

## References

- Story #479, PR #480 — D4/S5, Finding 6 and its residual Caso A.
- ADL [2026-09-10-scope-proposals-are-a-human-decision.md](2026-09-10-scope-proposals-are-a-human-decision.md)
  — the decision protocol this rule constrains; unchanged.
- `cycle-state.mjs` — `parseAcCard` / `extendCard`; `.claude/workflows/pair-contracts/cycle-state.test.mjs`
  — the fail-closed tests and the amended DT-16 fixture.
