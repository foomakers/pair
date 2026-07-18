# To-Issues Triage (Extend vs Create)

The generic shape a skill uses when it turns a **candidate tree** (brainstorm output, a decomposition pass, any list of vertical-slice items) into PM-tool writes: match each candidate against the **existing** backlog first, so planning merges into the tree instead of duplicating it. Named after the `to-issues` pattern (mattpocock) — scan first, propose extend-or-create, write only after confirmation.

## Idempotency key

Two items are the **same** item when their normalized title (lowercase, trimmed, punctuation-stripped) and parent identifier both match. This key is what makes a re-run safe: a candidate whose key matches an existing **open** item is the same item, not a new proposal.

## The four-step shape

> Numbered 1-4 below for this convention's own internal shape — distinct from, and not aligned to, the numbered Steps of any composing skill's own algorithm (a skill's "Step 3" is its own numbering, not a reference to this list's item 3).

1. **Check**: Query the PM tool for existing items under the relevant parent scope (the tree the candidate would attach to). Build a registry — same shape as an existing-item registry any plan-* skill already builds, keyed for matching (idempotency key above) rather than just listed.
2. **Skip**: If a candidate's idempotency key exactly matches an existing **open** item, it already exists — no proposal, report it as already-present (this is the re-run/idempotency path, not a triage decision).
3. **Act**: For every remaining candidate, compare it against each existing item (open or closed) in the same parent scope and classify:
   - **Substantial overlap** (the candidate's scope is already covered by the existing item — implementing it would mean adding an acceptance criterion or task to that item, not slicing a new one) → propose **EXTEND `<id>`**, with the one-line rationale for the overlap.
   - **No substantial overlap** → propose **CREATE**, with the one-line rationale for why it's distinct.
   - **Ambiguous** (score sits in the borderline band, or more than one existing item is a plausible match) → present as a question with a recommendation; never silently pick one side.
   - **Best/only match is Closed** → never EXTEND a closed item. Propose CREATE, with a reference (link/comment) back to the closed item so the history isn't lost.

   Precedence: the closed-item rule applies regardless of ambiguity. A closed item that is the sole plausible match is always CREATE-with-reference, never surfaced as an ambiguous question — closed items are never EXTENDed either way, so there's nothing ambiguous left to ask about.
4. **Verify**: Every candidate has exactly one proposal (`EXTEND <id>` or `CREATE`, or an ambiguous question) with its rationale shown — **before any write**. The developer confirms the full proposal list (dry-run); only confirmed `CREATE`/`EXTEND` proposals reach the write-issue step.

## Threshold — keep it conservative

"Substantial overlap" is deliberately conservative: default to CREATE unless the overlap is clear. Over-eager EXTEND proposals silently absorb distinct work into an existing item's scope; a false CREATE just costs a duplicate the next triage pass will catch (once the new item itself becomes an existing item with its own idempotency key). Always user-confirmed either way (Step 4) — the threshold only decides which side of the question gets recommended, never which side gets written unconfirmed.

## Fixture example

Existing tree (parent: Epic `#40`):

```text
#41 (open):  "User can reset password via email link"
#42 (closed): "User can reset password via SMS code"
```

Candidate tree (this run):

```text
- "User can request a password-reset email"       -> key≈#41 same parent, substantial overlap
- "User can reset password via SMS code"          -> key==#42, but #42 is Closed
- "User can log in with a magic link"              -> no existing match
```

Proposal list shown before any write:

```text
├── "User can request a password-reset email"  -> EXTEND #41 (same reset flow, email channel already scoped)
├── "User can reset password via SMS code"      -> CREATE (ref #42 — prior SMS attempt, closed; new item, not reopened)
└── "User can log in with a magic link"          -> CREATE (distinct auth flow, no overlap)
```

Re-running this same candidate tree after the two CREATEs land: the SMS and magic-link candidates now match their own new items by idempotency key (Step 2) — reported as already-present, no duplicates. `#41` is still open, so the email candidate is re-checked in Step 3 the same way (still EXTEND `#41`, not a duplicate EXTEND — the write-issue step, composed with `$id: #41`, updates rather than duplicates).

**Body-merge idempotency**: an overlap-based EXTEND re-proposes on every run (its key never exactly matches), so the caller re-merges the additional scope into the matched item's current body each time. That merge must be a **no-op when the scope is already present** — check before appending — so repeated planning runs update the item in place without the scope text accreting inside it.

## Per-skill delta (what stays in the skill, not here)

Only these vary per skill and belong in the skill's own step that composes this pattern:

- Which PM-tool query defines "existing items under the relevant parent scope" (Step 1).
- What "vertical slice" or item-specific validation runs on CREATE candidates before they're proposed (e.g. INVEST for stories) — this pattern only decides EXTEND vs CREATE, not whether a CREATE candidate is well-formed.
- The exact wording of the proposal list and confirmation prompt.
