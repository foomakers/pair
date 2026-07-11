# Context Map Inline-Maintenance Guideline

Guidance for keeping `context-map.md` — and its lazily split `subdomain/<slug>.context.md` siblings — accurate as a living artifact. There is no dedicated process skill for this: brainstorm and refine sessions update the map inline, using this guideline, as part of their own domain step.

## Purpose

Give AI assistants a repeatable method for maintaining a project's ubiquitous language, entities, and domain-wide rules without adding a maintenance ceremony. The map is dispatcher + index + core; the unit is the **subdomain** — no separate "domain" taxonomy is introduced.

## When This Applies

- A brainstorm session reaches its domain step and a feature touches an existing or emerging domain term.
- A refine session drafts acceptance criteria or business rules that name a domain concept.
- Any session that would otherwise invent a term, entity, or rule silently instead of registering it.

Skip this entirely for projects with no domain complexity — see [Graceful Degradation](#graceful-degradation).

## Inline-Maintenance Method

Apply these four checks whenever the session's domain step is reached. They are lightweight — seconds, not a workshop.

### 1. Challenge the Glossary

Before adding a term, check whether `context-map.md` (or the relevant `subdomain/<slug>.context.md`) already has it, or something close enough to conflict. Read the [Subdomain Index](../../collaboration/templates/context-map-template.md) first to know which subdomains keep their context inline versus split out.

### 2. Sharpen Vague Terms

Reject definitions that only restate the term. A glossary entry must be specific enough to write a test against — "what would make this term's definition false in a scenario?"

### 3. Stress-Test With Scenarios

Run the new or sharpened term through one concrete scenario from the current feature. If the scenario reveals a second meaning or an edge case the definition doesn't cover, fix the definition before moving on.

### 4. Cross-Check With Code

When the codebase already has a type, table, or module using the term, verify the glossary definition matches what the code actually does. Flag the mismatch instead of writing a definition that only matches the ticket.

### 5. Cite the Deciding Source

Every term, entity, and rule points to where it was decided, so the map stays citable. Prefer the most stable reference available, in this order: an adopted ADR/DDR or decision-log entry, then a linked guideline/template, then the issue number. When the only source is a working or triage document that is **not tracked in the repo** (e.g. a requirements-triage note), cite a stable handle from it — the issue number plus the decision ID (`#<n>`, `D<k>`) — rather than a file path that will not resolve for a reader. Terms are both concepts and the framework's own **meta/process terms** (states, phases, record types, distribution) — not only business-domain nouns; register whichever the ubiquitous language actually uses.

## Lazy-Split Criteria and Convention

The map starts as a single file. Splitting is **lazy and human-approved — never automatic.**

- **Signal to propose a split**: a subdomain's inline Glossary/Entities rows in `context-map.md` have grown large enough that scanning the shared file for unrelated subdomains becomes noisy, or the subdomain's context changes far more often than the rest of the map.
- **Propose, don't act**: the maintaining session states the reason and asks for approval — e.g. "`billing`'s glossary is now 12 terms; move it to its own context file?" Proceed only once the human agrees.
- **What moves**: every Glossary and Entities row scoped to that subdomain moves to the co-located sibling `subdomain/<slug>.context.md` (see `subdomain-context-template.md`), sitting next to the strategic `subdomain/<slug>.md` catalog file.
- **What stays**: the Subdomain Index row (flipped to "Yes" under Own Context) and the entire Common Rules and Invariants section — domain-wide rules are never split, since they aren't owned by one subdomain.
- **Never re-map automatically**: a later session may propose merging a context file back inline if it shrinks, but this again requires human approval — the guideline never rewrites the split on its own.

## Loading and Conflict-Flag Instructions for Consuming Skills

Any skill that touches domain scope (brainstorm's domain step, refine-story's requirements analysis) should, when it reaches that step:

1. **Load**: read `context-map.md` if present. For any subdomain the current work touches whose index row shows an own Context File, also read that `subdomain/<slug>.context.md`.
2. **Check**: compare the proposed feature, term, or rule against the loaded Glossary, Entities, and Common Rules and Invariants (root map plus any loaded subdomain file).
3. **Flag on conflict**: if the proposal contradicts a registered rule or redefines a term, stop and surface it explicitly — cite the conflicting rule (and the DDR that formalizes it, when one exists) — and ask the human to resolve before proceeding. Do not silently override a registered rule.
4. **Update inline**: once a new or sharpened term, entity, or rule is approved, write it back to the map (or the owning subdomain's context file) using the [Inline-Maintenance Method](#inline-maintenance-method) above. This is a normal step inside the calling skill, not a separate invocation.

## Graceful Degradation

- **Map absent**: this is the expected steady state for small projects and new projects — proceed without a domain check and continue. Absence is not a failure (adoption is delta-only).
- **No-DDD project**: the "system areas" fallback used by planning skills is unrelated to this guideline and unaffected by it — do not create a map just to satisfy this guideline.
- **Term conflict inside one session**: since the map is a single file, present both definitions side by side and let the human pick; do not merge them silently.
- **Subdomain without a Volatility value in the catalog**: leave the index cell empty. Never invent a Volatility rating here — it is mirrored from `subdomain/<slug>.md`, not authored in the map.

## Related Documents

- **[Context Map Template](../../collaboration/templates/context-map-template.md)** — the dispatcher + index + core artifact this guideline maintains
- **[Subdomain Context Template](../../collaboration/templates/subdomain-context-template.md)** — the lazy-split sibling file
- **[Strategic Subdomain Definition](strategic-subdomain-definition.md)** — subdomain catalog and classification, source of the mirrored Volatility column
- **[Domain-Driven Design](domain-driven-design.md)** — overall DDD principles this guideline operationalizes as a maintenance process
- **[Decision Records](../decision-frameworks/README.md)** — ADR/DDR process for domain decisions cited during conflict-flagging
