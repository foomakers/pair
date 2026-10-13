# Package-Local Adoption (Override)

Opt-in override that **co-locates adoption rules with the code** (`<pkg>/.pair/`) and turns the central adoption file into an index/router, so skills load only the packages a diff or story touches. It is the technical twin, for packages, of the co-located subdomain contexts ([context-map maintenance](../../../architecture/design-patterns/context-map-maintenance.md)): one mechanism, two units (subdomain | package).

## Default Is Unchanged

The override is **pure delta**. A project without a router section loads every rule from central adoption (`.pair/adoption/`), exactly as before. No artifact is created, no skill changes behaviour, until the override is activated. Activation is a human decision — see [Activation Proposal](#activation-proposal).

## Layout

```text
.pair/adoption/tech/architecture.md     # central: global rules + router section
apps/web/.pair/architecture.md          # local: rules for apps/web only
apps/web/.pair/testing.md
packages/ui/.pair/code-design.md
```

- Local dir: `<pkg>/.pair/<area>.md`, `<area>` = the central adoption area name (`architecture`, `testing`, `code-design`, `security`, …).
- Local files hold **only** rules that apply to that package. Global rules stay central.
- Local `.pair/` dirs are project content: excluded from KB registries, never touched by `pair install` / `pair update` (same protection as `.pair/working/`). The CLI rejects a registry target at or inside a `<pkg>/.pair`.

## Router Section

The central adoption file keeps global rules and gains one section, `## Package-Local Adoption`, listing the packages that have local context:

```markdown
## Package-Local Adoption

| Package    | Local context        | Areas                    |
| ---------- | -------------------- | ------------------------ |
| apps/web   | `apps/web/.pair/`    | architecture, testing    |
| packages/ui| `packages/ui/.pair/` | code-design              |
```

- One row per package; `Package` is a repo-relative path, `Local context` the dir, `Areas` the files present.
- The router is the **only** index. A package absent from it has no local context.
- Router out of sync (row whose dir is missing): see [Edge Cases](#edge-cases).

## Precedence

1. **Local wins for its package**: when a central rule and a local rule cover the same subject, the local rule applies to files under that package.
2. Globals always load; only package-locals are scoped.
3. A central rule that also exists locally is a **conflict to report**, not to resolve silently: `assess-*` and `review` list it under findings (rule, central source, local source, package) so the human decides whether to delete the central copy.

## Activation Proposal

Skills never activate the override. When a skill (`review`, `assess-*`, `refine-story`) detects complexity, it **proposes** and waits for human approval.

Signals (declarative; thresholds live **here**, never hard-coded in a skill):

| Signal | Default threshold |
| ------ | ----------------- |
| Packages touched by the diff/story that each have recurring package-specific rules in the central file | ≥ 3 |
| Central adoption file size | > 400 lines |

Either signal fires the proposal. A project may tune the thresholds in its router section (`Thresholds:` line); absent, the defaults apply.

Proposal content (a scaffold plan, nothing written):

- which packages get a local `.pair/`
- which central rules move to which `<pkg>/.pair/<area>.md`
- the router section that would be added

Only after explicit approval is anything created (see [approval rounds](approval-rounds.md): the proposal is a judgement gate — it asks even under `$approval: auto`, and without an answer nothing is created). A declined proposal is not repeated for the same signal values within the session.

## Edge Cases

| Case | Behaviour |
| ---- | --------- |
| Diff touches a package without local `.pair` | Global rules apply; no warning |
| Story references no package | Central-only loading |
| Router lists a package whose dir is missing | Report the dangling entry; continue with globals |
| Package has `.pair/` but no router row | Not loaded; `verify-adoption` reports the unlisted dir |

## Scoped Loading

How a skill derives the packages and loads the local set is one shared step: [scoped context resolution](scoped-context-resolution.md).
