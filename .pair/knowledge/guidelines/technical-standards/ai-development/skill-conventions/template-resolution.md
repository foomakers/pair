# Template Resolution

How any skill that uses a collaboration template (PR, commit, story, ADR, checkpoint, …) decides **which file to read**: the project's adoption override wins over the KB default, resolved by a **file-existence check** — never by parsing prose.

Every template link a skill carries points at the KB default path. Before using that template, resolve it override-first via the check below. When no override exists the resolution is a no-op and the skill uses the exact KB default it links today — **zero behavior change for the common case** (idempotent).

## Resolution — file-existence check (authoritative)

For a template whose KB filename is `<name>-template.md`:

1. **Check**: Does `.pair/adoption/tech/templates/<name>-template.md` exist?
2. **Act — override present**: Use the adoption file. The adoption override **always wins** over the KB default — no partial/hybrid merge, the override file is used whole, exactly as the skill would use the KB default.
3. **Act — no override**: Use the KB default `.pair/knowledge/guidelines/collaboration/templates/<name>-template.md` — the path already linked in the skill. Nothing changes.
4. **Verify**: Exactly one template file resolved (adoption if present, else KB).

`<name>` is the KB template's own filename (e.g. `pr-template.md`, `commit-template.md`, `adr-template.md`) — an override matches only when its filename equals a shipped KB template filename.

## The `## Templates` section is an audit trail, not the trigger

A project may list its overrides under a `## Templates` heading in `.pair/adoption/tech/way-of-working.md`. That section is a **human-readable audit trail / record of intent** — it is **not the resolution trigger**. Resolution depends only on the file existing on disk (step 1 above), never on that prose being present or accurate. This avoids a second source of truth drifting out of sync with the actual override files.

## Edge cases

- **Override file exists but is malformed/empty**: used as-is — same trust level as any adoption file. Validating template content is out of scope (not this resolution's job).
- **Override filename doesn't match any shipped KB template** (typo): silently unused — the skill falls back to the KB default it links, matching how unused adoption content behaves elsewhere.
- **`pair-cli install`/`update`**: `.pair/adoption/` is preserved/untouched, so overrides survive updates — no install/update change is needed for this resolution to hold.

## What stays in the skill (the delta)

Nothing skill-specific. Each skill keeps its existing template link(s) and a single pointer to this file, e.g.:

> **Template resolution:** resolve every collaboration template this skill links override-first — see [template-resolution.md](template-resolution.md).

This is a context pointer, not a citation: the executor follows it when it reaches a template it must read, the same way it follows any other guideline pointer.
