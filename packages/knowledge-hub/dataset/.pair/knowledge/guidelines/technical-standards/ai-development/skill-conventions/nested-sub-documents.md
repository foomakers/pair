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

- **Relative links keep working in both directions.** `SKILL.md` → `./references/deep-dive.md` and `deep-dive.md` → `../SKILL.md` are both correct in the source tree AND in the installed tree, because the whole directory moves together. Write plain relative links; do not pre-compensate for the install path. (True for a skill at the standard `<category>/<skill-name>` depth — see the exclusion below.)
- **A sub-document is content, not a skill.** It is not a separate installed entry, gets no name prefix, and its frontmatter (if any) is left alone. Do not give a sub-document a `name:` matching a skill name, and do not expect a sub-directory name to be invocable.

## The one exclusion: a skill that is not at the standard depth

The pipeline is told **how deep an entry is** (`flattenDepth` in the registry config — 2 for `<category>/<skill-name>`). A skill that sits **shallower** than that — directly at the registry root, with no category directory — cannot ship a sub-directory: its `<skill-name>/references/` has exactly the shape of a real `<category>/<skill-name>` entry, so it would install as a **sibling** `<prefix>-<skill-name>-references/` rather than inside the skill. The pipeline **fails the copy loudly** in that case instead of installing something broken:

```text
Ambiguous layout for a bounded flatten (flattenDepth=2): 'next' is 1 segment(s) deep,
holds files directly AND owns the sub-directory 'next/references'. …
```

To give such a skill a sub-directory, first move it under a category directory (that renames the installed skill, so it changes the name users invoke — decide deliberately).

## Authoring rules

1. **Only the entry directory holds `SKILL.md`.** A `SKILL.md` inside a sub-directory would read as a second skill; put the entrypoint at the skill's root and nowhere else.
2. **Point at sub-documents with relative links** from `SKILL.md`, at the step that needs them, so the executor follows the pointer when it gets there — the same way it follows pointers to guideline files.
3. **Keep the entrypoint self-sufficient for the happy path.** A sub-document is for depth (long catalogs, worked examples, edge-case tables), not for material the skill needs on every run.
4. **One level is usually enough.** Deeper nesting is preserved too, but it costs the reader a hop for no gain in most cases.
