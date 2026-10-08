# Doc remediation groups (`fixScope.mode: doc`)

Single owner of the rule for findings whose fix is **prose only** — Markdown, `SKILL.md`, KB guidelines, docs (maintainer decision 2026-10-06; see the ADL of that date). Executable witnesses cannot discriminate a text fix: a text-matching test either rejects a correct rephrasing or misses a class, and a contract made of such tests fails validation round after round (`failed-contract`). A doc group replaces them with a reviewable acceptance checklist.

## When

`red-spec` plans a `doc` group when EVERY finding of the group is fixed by prose alone (no executable behaviour, no code, no test). A finding that touches behaviour stays `behavioral` (or `test` / `structural`): a doc group **never carries executable tests**, and a mixed finding is split.

## Grouping is deterministic (validated at red-spec publish)

`red-spec` does not judge; `cycle-state.mjs publish` validates the plan:

- A finding's **target paths** are the ones the planner declares for it (`group.findingPaths: { "<finding id>": [paths] }`), else every path in the review finding's `location` text. No target path at all ⇒ not judged.
- A `behavioral` or `test` group holding a finding whose targets are ALL prose is refused: `prose-finding-not-doc: <id> belongs in a doc group` — the stage must re-plan. A `doc` group holding a finding that touches any code is refused: `code-finding-in-doc-group: <id>`; a doc group's `allowedPaths` must be prose (`doc-group-code-paths`).
- **Mixed finding** — one finding needing code AND its own doc text: it stays `behavioral`. Its `allowedPaths` may include the related prose files; its witnesses cover behaviour only; the review verifies the prose.
- **Mixed round** — some findings prose-only, others code: split into a `behavioral` group and a `doc` group with `dependsOn: [<the behavioral group>]`, so the prose is written after the code fix. The cycle runs prepare → validate → green for the first group, then for the second, then ONE verify reviews both.

Example (a facade behaviour fix plus the SKILL text that describes it):

```json
{ "groups": [
  { "groupId": "r1-g1", "findings": ["r0-1"], "mode": "behavioral", "owner": "facade", "allowedPaths": ["src/facade.ts"] },
  { "groupId": "r1-g2", "findings": ["r0-2"], "mode": "doc", "owner": "skill", "allowedPaths": ["skills/x/SKILL.md"], "dependsOn": ["r1-g1"] }
] }
```

## The contract

- `fixScope`: `{ owner, mode: "doc", allowedPaths }` — every entry a prose file (`.md`, `.mdx`, `.txt`, `.rst`, `.adoc`) or a directory of them; a code path in `allowedPaths` is refused.
- `checklist`: a non-empty array of `{ id, finding, requirement, authority }` — what the text must state (quoted), per finding, against the authority it must agree with (a source line, an ADR, a guideline). Ids are unique.
- No `redTests`, no witnesses, no controls. The snapshot (`red-snapshot.mjs seal`) is the contract manifest alone.

## The stages

1. **red-spec** (`prepare`) writes the inventory, `fixScope` and `checklist`; it runs nothing.
2. **red-verify** (`validate`) checks the inventory, the scope (prose only) and every checklist item against its authority — it does NOT reproduce tests. Its handoff carries `contractMode: "doc"` and `checklistValidated: [<item ids>]` instead of `reproduced` rows; every gap is one typed rejection with the item id. It then seals.
3. **green-fix** edits ONLY inside `fixScope` and returns an `evidenceLedger` mapping each checklist item id to the changed text (file:line and the sentence).
4. **review-phase** verifies each checklist item against the diff and the authority, and the usual conformance/link tests; custody holds when only `fixScope` prose files changed after the seal (`verify-chain`).

## Custody

`red-snapshot.mjs verify` / `verify-chain` treat a doc contract like any other: the snapshot is the ancestor, nothing but `allowedPaths` prose changes after it, the transient manifest is removed by the GREEN commit.
