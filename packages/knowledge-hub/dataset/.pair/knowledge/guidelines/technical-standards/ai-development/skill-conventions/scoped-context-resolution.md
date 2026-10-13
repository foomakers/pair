# Scoped Context Resolution

The shared context-resolution step used by skills that adopt the [package-local adoption override](package-local-adoption.md): derive the touched packages, read the router, load only the matching local `.pair` dirs. A skill states its **delta** (diff vs story scope) and points here.

## Algorithm

1. **Router present?** Read the `## Package-Local Adoption` section of the central adoption file(s). Absent ⇒ override inactive ⇒ load central adoption only (today's behaviour) and stop. Complexity signals may still fire an [activation proposal](package-local-adoption.md#activation-proposal).
2. **Derive touched packages**:
   - **Diff-scoped** (`review`, `assess-*`): `git diff --name-only <base>...HEAD` (or the PR file list); a file belongs to the router package whose path is its longest prefix.
   - **Story-scoped** (`refine-story`): repo paths and package names referenced in the story body, AC and notes; map each to a router package the same way.
3. **Load**: global rules always; then `<pkg>/.pair/*` for each touched package listed in the router. Load nothing from untouched packages.
4. **Report anomalies, never fail**: a router row whose dir is missing → report the dangling entry, continue with globals. A touched package with no router row → globals only, no warning. No package derived → central-only.
5. **Conflicts**: a rule present centrally and locally → apply local for that package ([precedence](package-local-adoption.md#precedence)) and report the conflict.
6. **Record the loaded set** (globals + which `<pkg>/.pair` dirs) in the report so the scoping is auditable.

## Per-skill delta

Only the scope source (diff | story) and where the loaded-set line appears in the output belong in the skill.
