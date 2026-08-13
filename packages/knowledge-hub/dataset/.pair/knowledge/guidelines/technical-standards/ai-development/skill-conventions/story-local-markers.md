# Story-Local Acceptance-Criterion Markers — Banned

No shipped skill or KB file may cite an acceptance criterion of the story that motivated it. A marker like `(AC<n>)` — in any spelling: a bare parenthetical, `(epic AC<n>)`, `(decision Q5, AC<n>)`, a heading suffix, `the AC<n> signal` in prose — is a **story-local** reference, and story-local references do not ship.

## Why

- **No referent.** The reader installing this corpus into their own project has no access to the story that motivated the sentence. A criterion number without its story is a citation of nothing.
- **Stale by construction.** Criterion numbers are positional: the moment the story is re-refined, split, or renumbered, the marker silently points at a different criterion — or none. Nothing in the corpus detects the drift.
- **It outsources the justification.** A sentence that leans on `(AC<n>)` for its "why" carries no justification once shipped. The sentence must carry its own justification or none — state the reason inline, or cite a durable referent (a decision record, a requirement ID like `R5.7`, a guideline section).

## What remains legitimate

Three shapes of `AC<n>` are **not** story-local, because the referent travels with the token:

| Shape | Why it is fine | Example |
| --- | --- | --- |
| **Template placeholder** | The token is the artifact's own structure — the template defines the slot right where it names it | the epic and PRD templates' `**AC<n>:** [criterion]` rows |
| **Worked example** | An example story body defines its criteria on the same page it cites them | the filesystem-PM guideline's sample story |
| **Referent-carrying citation** | `#<story>/AC<n>` names its story — the reader can open it and find the criterion | the code-review template's introduced-red-security rule |

Anything else is a story citation. When in doubt: if deleting the marker loses information the sentence still needs, the sentence is incomplete — rewrite it to say the reason; do not keep the marker.

## Enforcement

In this corpus's source repository the ban is enforced corpus-wide by the conformance guard `packages/knowledge-hub/src/conformance/story-local-markers.test.ts`: it walks every shipped file — skills (dataset and installed mirrors) and KB guidelines, templates and asset scripts (dataset and installed copies) — markdown or not, and fails naming file and line for any offender. Asset scripts count: a `.md`-only walk once let a shipped `coverage-gate.sh` keep three citations under a green suite. The legitimate shapes above are the guard's only exemptions — a curated per-file allowlist for placeholders and worked examples, plus the `#<story>/AC<n>` pattern. The guard exists to catch reintroduction after the fact; this page exists so an author never introduces one in the first place.
