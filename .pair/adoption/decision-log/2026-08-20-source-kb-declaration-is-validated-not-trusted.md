# Decision: a source KB's configuration declaration is validated, not trusted — it may namespace its content, never choose where the install writes

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

Story #396 made `pair install --source <kb>` read the source KB's own `pair.config.json`, so a
maintainer's declared namespacing (notably `skills.prefix`) applies without every consumer
copying a config file in. That is the feature — and it also introduces a **new trust
boundary**: configuration supplied by remote, third-party content now participates in
resolving an install that writes to the consumer's disk.

The first implementation merged every field of every matching registry entry. `targets[]`
is one of those fields, and `resolveTarget` joins a target path onto the project root with
no containment check: no validator constrains a registry target to the project
(`validateRegistry` checks types, `detectOverlappingTargets` compares registries against
each other, `detectReservedPathOverlap` guards only `.pair/working` and
`.pair/.kb-version.json`). A KB shipping

```json
{ "asset_registries": { "agents": { "targets": [{ "path": "../../.zshenv", "mode": "canonical" }] } } }
```

would therefore have written its own file to `~/.zshenv` on `pair install --source`, since
the "already exists" pre-flight only refuses paths that ALREADY exist. `prefix` was the
same hole one size smaller: it becomes a path segment (`${prefix}-${dir}`) and accepted any
string. This contradicted the repo's own convention that externally-sourced path input is
[validated, not trusted](2026-08-11-kb-cache-slots-keyed-by-source-identity.md)
and the user documentation, which promised guards on layer 2 precisely because "the source
is the one layer you do not control".

## Decision

**Resolution has four layers, weakest first — CLI defaults < source KB declaration <
project `pair.config.json` < `--config` — and layer 2 is honoured on a closed allowlist of
fields that describe the source's OWN content and namespacing.**

Honoured, per registry (`SOURCE_DECLARABLE_FIELDS` in `apps/pair-cli/src/config/loader.ts`):

| Field | Bound |
| ----- | ----- |
| `source` | a **KB-relative path that stays inside the KB** — absolute, `..`-escaping (before or after normalisation) and Windows-drive/UNC values are dropped |
| `include` · `exclude` · `flatten` · `flattenDepth` · `description` | unbounded — they select and shape the KB's own files |
| `prefix` | a **single path segment** — no `/`, `\` or `..` |

The two path-shaped fields are CONTAINED, not merely allowed (`FIELD_GUARDS`). A field
failing its check is dropped on its own; the layer beneath supplies the value and the rest
of the declaration still applies.

Ignored — dropped before the merge, never overridden later:

- `targets`, `target_path`, `behavior`, and every other registry field;
- every top-level key, including `working_path` and `target`;
- a `prefix` containing a path separator or `..` (it is a path SEGMENT, so a traversing
  prefix is `targets` by another name);
- a `source` that is absolute or leaves the KB root;
- a registry entry that is not a JSON object.

Consequently **a source KB can never decide where the install writes, nor where it
reads.** Where content lands is set by the CLI defaults, the consuming project, and
`--config` — the three layers the consumer controls; where it comes from is bounded by the
KB root.

The read side needed the same rule as the write side and did not have it in the first
implementation. `source` is on the allowlist and is resolved by `resolveRegistryPaths` as
`resolve(datasetRoot, config.source)`, so `"source": "../home/victim/.ssh"` (or an absolute
path, which `path.resolve` substitutes outright) made `pair install --source <kb>` copy
arbitrary local files INTO the consumer's repository — credentials landing in a tree the
user commits and pushes, and a disk-fill DoS for a large one. "It may describe its own
content" is not satisfied by a path that leaves the KB.

**Layer 2 applies to `install` and `update` alike.** A named source declares its registries
on both. Reading the declaration on install only meant the first `update --source` after a
successful install re-installed the same skills under the CLI's default prefix and left BOTH
copies in place (skills is `overwrite`, so nothing cleans up the first) — the duplicate
`prefix` exists to prevent, in a state install alone could never produce. Update surfaces the
malformed-declaration warning and the declared-but-unknown skips exactly as install does.

Three further rules on layer 2, unchanged in intent but now exhaustive:

- **A declaration that is not a JSON object with an object `asset_registries` is
  malformed** — including a valid-JSON `null`, string, number or array — and takes the
  ignore-and-warn path. A half-parsed declaration is never applied, and never reports
  itself as applied.
- **The warning reaches the user**, on the console, not only the in-memory diagnostics log
  (which nothing consumes).
- **Layer 2 never introduces a registry.** A registry name the CLI has no definition for is
  reported as skipped (`declared by source, unknown to this CLI`) and its fields are not
  layered beneath a consumer entry of the same name: to adopt it, the consumer declares it
  IN FULL.

**Layer 3 is the project being installed into, resolved from the install target** — not the
CLI's module directory, which is what the loader defaults to and which in the released CJS
layout is the pair-cli package root. Layer 3 reads that project's `pair.config.json` only;
the `config.json` fallback is disabled there, because the name is too common to claim in
someone else's repository.

## Alternatives Considered

- **Validate after the merge that every resolved target is inside `baseTarget`.** Rejected
  as the primary guard: it accepts the source into the path decision and then argues about
  where it landed, so every future path-shaped field (a new `prefix`-like segment) is
  another hole to remember. An allowlist fails closed — an unknown field is ignored by
  default. A containment check remains a reasonable second layer if targets ever become
  consumer-scriptable.
- **Allow `behavior` from the source.** Rejected: `mirror` deletes what the source does not
  ship, inside a target the consumer chose. Flipping a consumer's registry to `mirror` is a
  destructive decision, and it describes the relationship, not the source's content.
- **Trust the source fully and document the risk.** Rejected outright: "the KB you install
  can write anywhere in your home directory" is not a documentable property.
- **Drop half B until a signing/provenance story exists.** Rejected: the value (a KB
  namespaces its own skills) is real and the boundary is enforceable with a field list;
  provenance would gate the whole external-KB feature, not this field.

## Consequences

- `readSourceDeclaration` returns a declaration built ONLY from allowlisted fields, so
  `mergeConfigs` can no longer receive a source-declared path of any kind.
- Install and update pass `projectRoot` (the install target) and `projectConfigOnly`, so
  the consuming project's own configuration is read where it actually lives. Before this,
  AC4 ("the consuming project's configuration wins") held in tests only — production read
  the CLI package root.
- Regression tests pin the boundary: a source declaring `targets` outside the project, a
  traversing `prefix`, a separator-carrying `prefix`, top-level `working_path`/`target`,
  and non-object declarations (`null`, array, string, number) — at the loader AND through a
  real install.
- The rule is published in `apps/website/content/docs/reference/configuration.mdx`
  ("What layer 2 may say"), so a KB maintainer reads the same list the CLI enforces.
- Adding a new registry field is now a two-place decision: the field itself, and whether
  layer 2 may state it — and, if it is path-shaped, what bounds it. Default is no.
- **`LoadedConfig.source` names the resolution CHAIN**, weakest first
  (`pair-cli config.json < source KB declaration: /kb < pair.config.json`), instead of the
  last layer that wrote. A single-valued label described the resolution wrongly in exactly
  the case this ADL is about. Install and update print it once, when a declaration actually
  applied, which is also what gives `SourceDeclarationOutcome.applied` a production
  consumer: a KB maintainer can see the declaration was honoured instead of inferring it
  from the installed directory names.
- **`install --list-targets` resolves configuration the same way `install` does** (project
  root, no `config.json` fallback). It previously resolved from the CLI module directory, so
  the command whose only job is to say where content lands disagreed with the command that
  lands it in any project carrying its own `pair.config.json`.

## Adoption Impact

- No `tech/` adoption file changes: this decides how our own CLI treats external input.
- Sibling record: the install outcome model and exit-code contract this story also
  introduces is in
  [2026-08-19-install-outcomes-absent-is-not-failed.md](2026-08-19-install-outcomes-absent-is-not-failed.md).
