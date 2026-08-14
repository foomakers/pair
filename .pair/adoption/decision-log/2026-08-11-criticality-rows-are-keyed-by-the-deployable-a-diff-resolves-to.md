# Decision: criticality-table rows are keyed by the deployable a diff resolves to

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

Quality-model §3.1 keys the Service/domain criticality dimension by "service/domain", and §6 penalises a miss hard: a service **not listed** in an existing table resolves to conservative **High**, while no table at all resolves to Medium. So the key is the whole contract — and until now only the *read* side had an implicit answer to "which key is queried?", never written down. The write side had none at all: `risk-matrix-example.md` shows service names (`payments`, `marketing-site`) without saying what makes a name the right one.

Story #351 gives the two delta sections a guided authoring path (bootstrap Phase 3.6) whose candidate rows come from the domain model Phase 3.5 just mapped. That made the gap load-bearing: bounded contexts and subdomains name **business** boundaries, and in this very repository they are `development-collaboration` / `knowledge-standards` / `integration-process-standardization`, while a diff resolves to `apps/website` / `packages/knowledge-hub` / `packages/pair-cli`. A table authored from the catalogs alone would leave every queried key unlisted — every PR red on that dimension, i.e. a project accepting the offer ends up strictly worse off than one declining it.

## Decision

**The key namespace is the deployable that owns the touched files** — workspace package, app, or top-level path scope (a single-deployable repository resolves to that one scope). Written into quality-model §6 as a `Key namespace` bullet next to the malformed-file and unknown-service rules, so both sides read it from the schema owner:

1. **Read side**: a story or diff resolves to that identifier when the criticality dimension is looked up.
2. **Write side**: rows are keyed by that identifier, and by nothing else. Bounded contexts and subdomains **name candidates and recommend values**; they never define the key space. Bootstrap Phase 3.6 maps each context onto the deployable it lives in (one context across two deployables ⇒ one row each; two contexts inside one deployable ⇒ one row at the higher value).
3. **Recommended value** is judged on its own terms — blast radius, user-facing exposure, data sensitivity, uptime expectation — with an explicit High/Medium/Low default mapping, and deliberately **not** derived from the subdomain class, which §3.1 already spends on the Business impact dimension.

Asserted in `packages/knowledge-hub/src/conformance/bootstrap-classification-delta.test.ts`: §6 must define the key (both root and dataset copies), and Step 3.6.1 must key by it while demoting the catalogs to candidate/value sources.

## Alternatives Considered

- **Leave the key implicit and key rows by bounded context** (the round-1 wording): Rejected — it is the failure case above. Nothing resolves those names, so the rows are never read and the deployables they meant to cover stay unlisted ⇒ conservative High.
- **Let the read side accept either namespace** (try the deployable, then the context/subdomain): Rejected. It turns a miss into a fuzzy match, and §6's conservative-High rule only works with an exact, single key space; two namespaces also make "not listed" undecidable.
- **Say nothing in §6 and fix only bootstrap's wording**: Rejected. The next writer of that file (hand-authoring, or a future skill) would face the same unanchored question, and the example asset would still not say what makes a name correct.

## Consequences

- `risk-matrix-example.md` states the keying rule in-file, so the copy-paste starting point carries it.
- Criticality and Business impact stay independent signals: five dimensions, five inputs.
- A project whose deployables and bounded contexts share names sees no change — the rule only bites where they diverge, which is where the silent-red failure lived.
- Website mirror (`apps/website/content/docs/reference/quality-model.mdx`) repeats the one-clause rule; the full schema stays in the guideline.

## Adoption Impact

- `.pair/knowledge/guidelines/quality-assurance/quality-model.md` §6 gains the `Key namespace` bullet (dataset mirror in lockstep).
- `.pair/adoption/tech/risk-matrix.md` (this repository's own delta) is unchanged — it declares `## Tag Projection` only, which stays a valid state.
- No dataset mirror of this ADL: sibling ADLs in `adoption/decision-log/` are adoption-only records.
