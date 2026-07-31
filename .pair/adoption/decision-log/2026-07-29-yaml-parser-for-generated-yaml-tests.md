# Decision: generated YAML is asserted by PARSING it (dev-only `yaml` dependency), not by string-matching

## Date

2026-07-29

## Status

Active

## Category

Tooling Adoption

## Context

`pair-cli scaffold-kb` (#279) generates two YAML documents whose values include a
maintainer-supplied KB name: `.github/workflows/release.yml` and the seed skill's
`SKILL.md` frontmatter. Round 1 of review fixed the quoting in the workflow (and the
shell quoting in `scripts/release.sh`) but **missed the third sink** — the seed skill's
`description` / `author` — and the whole test suite stayed green, because every test
asserted with `toContain` / `toMatch`.

That is the structural problem: `author: Acme: Core KB` string-matches perfectly and is
invalid YAML. A generator whose output is consumed by a parser cannot be guarded by
substring assertions; the only assertion that catches the class of bug is "a real parser
accepts this document and the value round-trips".

No YAML parser was a declared dependency of any workspace (`yaml@2.8.2` existed only as
a transitive dep of Vite, therefore not resolvable under pnpm's strict layout).

## Decision

`yaml@2.8.2` is adopted as a **devDependency** (catalog entry, currently used by
`apps/pair-cli`) for asserting generated YAML in tests.

Rule for generators: every generated YAML sink is covered by a test that **parses** the
generated document with `yaml`'s `parse()` and asserts the interpolated value
round-trips byte-for-byte, for a set of hostile-but-legal inputs (`:`, `"`, `\`, `#`,
leading `-`/`@`/`*`/`%`, flow indicators, `true`). String assertions may stay as
readability documentation, but they never stand alone. New YAML sink ⇒ new case in that
file (`apps/pair-cli/src/commands/scaffold-kb/templates/yaml-safety.test.ts`).

Production code keeps emitting values via `JSON.stringify(...)` (JSON is a subset of
YAML) — no runtime dependency is added, `yaml` never ships in the CLI bundle.

## Alternatives Considered

- **Keep string-matching, add more precise substring assertions**: Rejected. It is
  exactly what let the sink through; the assertion cannot distinguish a quoted scalar
  from a broken document.
- **Hand-roll a small frontmatter/YAML checker in the test**: Rejected. A parser written
  to the same (mis)understanding as the generator validates nothing; the value of the
  test is that it is an *independent* implementation of the spec.
- **Reuse the repo's frontmatter readers (`content-ops/frontmatter-transform`,
  `knowledge-hub/skills-conformance-check`)**: Rejected. Both are deliberate line-based
  scanners for rewriting/limits checking, not spec parsers — neither rejects
  `author: Acme: Core KB`.
- **`js-yaml` instead**: Rejected — `yaml` is already in the store as a Vite transitive
  dep, so adopting it adds no new resolved package, and it is the maintained,
  TypeScript-native option.

## Consequences

- One new dev-only dependency; lockfile delta is 6 lines and no new package is downloaded.
- A reviewer can now reject a generator PR that asserts YAML output with `toContain` only.
- The same rule is the natural home for future generated-YAML sinks (marketplace
  manifests, workflow templates).

## Adoption Impact

- `.pair/adoption/tech/tech-stack.md` — Testing section: `yaml` v2.8.2 listed as adopted
  for parsing generated YAML in tests.
- No knowledge-base/dataset mirror (adoption-only record, consistent with sibling ADLs).
