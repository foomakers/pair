# Nested Sub-Documents (Progressive Disclosure)

A skill is a **directory**, not a single file. `SKILL.md` is its entrypoint; anything else the skill owns lives beside it in that directory — including a nested sub-directory.

## The layout

```text
<category>/<skill-name>/
├── SKILL.md              # entrypoint — always loaded
├── merge-and-cascade.md  # a sibling sub-document
└── references/           # a nested sub-directory
    ├── deep-dive.md
    └── catalog.md
```

`references/` is the Agent Skills convention for **progressive disclosure**: material the executor should read only when it reaches the step that needs it, kept out of the entrypoint so `SKILL.md` stays small. The name is a convention, not a requirement — any sub-directory works the same way.

## How it installs

The distribution pipeline flattens only the **entry** part of the source path and preserves everything below it, so a skill's directory keeps its shape:

```text
<category>/<skill-name>/references/deep-dive.md
  →  .claude/skills/<prefix>-<category>-<skill-name>/references/deep-dive.md
```

The sub-directory installs **inside** the skill, not as a sibling directory of its own. Two consequences for the author:

- **Relative links keep working in both directions.** `SKILL.md` → `./references/deep-dive.md` and `deep-dive.md` → `../SKILL.md` are both correct in the source tree AND in the installed tree, because the whole directory moves together. Write plain relative links; do not pre-compensate for the install path. (True for a skill at the standard `<category>/<skill-name>` depth — see the exclusions below.)
- **A sub-document is content, not a skill.** It is not a separate installed entry, gets no name prefix, and its frontmatter (if any) is left alone. Do not give a sub-document a `name:` matching a skill name, and do not expect a sub-directory name to be invocable.

## The two exclusions: every entry must sit at the declared depth

The pipeline is told **how deep an entry is** (`flattenDepth` in the registry config — 2 for `<category>/<skill-name>`) and cannot represent a directory holding files at any other depth. Both sides fail the copy **loudly**, before a single file is written, rather than installing something broken.

### Too shallow: a directory above the entry depth that holds files of its own

Stated as the pipeline enforces it: **a directory shallower than `flattenDepth` may not hold files of its own once it owns sub-directories.** Two shapes hit this, not one:

- a **skill at the registry root**, with no category directory: its `<skill-name>/references/` has exactly the shape of a real `<category>/<skill-name>` entry, so it would install as a **sibling** `<prefix>-<skill-name>-references/` rather than inside the skill;
- a **category directory with a file of its own** (e.g. a `<category>/README.md` beside the skill directories): the pipeline tells a category apart from an entry by whether it holds files directly — deliberately, so no `SKILL.md` knowledge leaks into a transform shared by non-skill registries — so a category that holds a file reads as an entry with a sub-directory.

```text
Ambiguous layout for a bounded flatten (flattenDepth=2): 'next' is 1 segment(s) deep,
holds files directly AND owns the sub-directory 'next/references'. …
```

Ways out, per shape: move a registry-root skill under a category directory (that renames the installed skill, so it changes the name users invoke — decide deliberately), or move the category-level file into a skill directory (or out of the registry).

### Too deep: an entry below the entry depth that nothing owns as content

A `SKILL.md` one level too deep (`<category>/<sub>/<skill-name>/SKILL.md` at `flattenDepth: 2`) would install under a directory with no entrypoint at its root — invisible to the skill loader. It is told apart from legitimate content by its nearest ancestor at the entry depth: content belongs to an ancestor that holds files of its own (`<category>/<skill-name>` holds `SKILL.md`), an entry too deep has no such owner. Move it to the entry depth.

## Authoring rules

1. **Only the entry directory holds `SKILL.md`.** A `SKILL.md` inside a sub-directory installs as content — no name sync, no invocable directory — so it would be a skill nobody can reach; put the entrypoint at the skill's root and nowhere else. Where a skills conformance gate runs, it fails on any `SKILL.md` below the entry depth.
2. **Point at sub-documents with relative links** from `SKILL.md`, at the step that needs them, so the executor follows the pointer when it gets there — the same way it follows pointers to guideline files.
3. **Keep the entrypoint self-sufficient for the happy path.** A sub-document is for depth (long catalogs, worked examples, edge-case tables), not for material the skill needs on every run.
4. **One level is usually enough.** Deeper nesting is preserved too, but it costs the reader a hop for no gain in most cases.
