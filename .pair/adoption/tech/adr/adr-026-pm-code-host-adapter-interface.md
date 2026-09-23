# ADR-026: PM/code-host adapter interface for the delivery-cycle scripts

## Status

Accepted

## Date

2026-09-23

## Context

- Story #492 (epic #485). `cycle-state.mjs`, `pr-comment.mjs` and `pr-state.mjs` spawned `gh` directly. A project on Azure DevOps could not run the cycle, and adding a host meant editing the cycle's own scripts.
- The workflow skills install **standalone** (each skill folder self-contained, US-479). A shared module outside a skill folder does not resolve where the skill lands.
- ADR-018 already splits `pm-tool` (card operations) from `code-host` (PR operations). This ADR adds no resolution rule.
- The story names eight methods. The existing `gh` call sites also include card create/search/edit, a single-comment read, check/label read-backs and ref parsing (the scope-decision and `pr-state find` paths), which those eight do not cover.
- Hard to reverse: the adapter contract and the `.host-binding.json` file become the extension surface third parties write against.

## Options Considered

1. **One shared `host/` outside the skills.** Rejected: skills install standalone, so the path does not resolve after install.
2. **A static adapter list in `index.mjs`.** Rejected: adding a host would edit an existing file, which breaks story business rule 2.
3. **Generalize `CHECK_CONTEXT` / `STATE_LABELS` into the core.** Rejected: story assumption 2 keeps them as adapter constants.
4. **Resolve the host per call from way-of-working.** Rejected: AC2 requires one resolution per coordinator start.
5. **Chosen:** a `scripts/host/` directory copied into every workflow skill, with file-based registration and a binding persisted in the run directory.

## Decision

1. **Layout.** `scripts/host/` contains `index.mjs`, `adapter-kit.mjs`, `github.mjs` and `azure-devops.mjs`. It ships byte-identical in every workflow skill that runs a cycle script, and a parity test guards the copies. The registry is every `<id>.mjs` in the directory whose default export is `defineAdapter({ id: '<id>', … })`. A file that fails to load is recorded as broken, is never bound, and does not stop the other adapters from loading.
2. **Interface.** It has the eight named methods: `readCard`, `cardHash`, `prHead`, `upsertComment`, `concludeCheck`, `setPrState`, `merge`, `closeAndCascade`.
   - `cardHash` is derived by `defineAdapter` from `readCard`, and an adapter may not define its own. The canonicalization is sha256 over the raw body exactly as `readCard` returns it, so hashes stamped before US-492 still compare equal.
   - There are also ten **optional** primitives, taken from existing call sites: `createCard`, `findCards`, `updateCard`, `parseCardRef`, `listComments`, `readComment`, `parseCommentRef`, `commentRef`, `readCheck`, `readLabels`. If one is omitted, the feature that needs it fails typed `not-implemented`, naming the method.
   - Every method is a CLI spawn through the kit's `runCli`. No adapter reads a credential.
3. **Resolution (ADR-018).**
   - `pm-tool` comes from an explicit `` `pm-tool` `` key, or else from the "<Tool> is adopted for project management" line.
   - `code-host` comes from `## Git Workflow`. When it is omitted, it is the PM tool if that tool hosts code.
   - If nothing is declared, or there is no way-of-working file, the host is `github` (D21 default).
   - A declared value with no adapter HALTs `host-unsupported`, naming the value, the side and the implemented set. There is never a GitHub fallback.
4. **Binding once.** A coordinator (`pair-workflow-cycle` Step 1, and `pair-cli run`'s driver) runs `cycle-state.mjs bind-hosts --dir <run/story dir>`, which writes `.host-binding.json`.
   - Every later script call naming that directory reuses the binding (`cycle-state` via `--dir`, and `pr-comment` / `pr-state` via their new `--dir` flag). A way-of-working edit made mid-cycle is never picked up.
   - Without a binding file, resolution is memoized once per process.
5. **Error vocabulary is preserved.** Failure reasons keep their pre-US-492 spelling (`gh-issue-view-failed:…`). The prefix now comes from the adapter's `errorPrefix` (`gh`, `az`).
6. **Guarded import.** `cycle-state.mjs` imports `host/` guarded, with a top-level `await import()`. A copy without `host/` still answers every non-host command, and a host operation then fails `host-adapters-missing`.

## Consequences

### Benefits

- Adding a host means one file plus one way-of-working line. `cycle-state.mjs` and the cycle rules stay host-agnostic, and a test greps them for `gh`/`az` literals.
- Split-tool projects route card operations and PR operations to different adapters. A call made on the wrong side is refused as `wrong-side`.

### Trade-offs and Limitations

- There are six copies of `host/` per tree (dataset and installed), kept equal by a byte-parity test.
- The Azure DevOps adapter is proven against recorder stubs, not a live organization. Its REST shapes follow the Azure DevOps REST 7.1 reference.
- Azure DevOps has these limitations:
  - no `rebase` merge;
  - `createCard` creates a `User Story`, so a Scrum project's `Product Backlog Item` is not selected;
  - the PR status is bound to the iteration whose source commit is the verified head;
  - the comment-size cap copies GitHub's 65536, because no documented Azure limit could be verified.
- `red-snapshot.mjs`'s seal trap still shims only `gh`, and it is named as an exception in the literal grep.
- The `pair-cli` console driver's own card read (`readCardDocumentViaGh`) is outside the scripts, so it stays GitHub-only.

## Adoption Impact

- `architecture.md` → `## Unattended Dispatch`: a new bullet on the PM/code-host adapter layer.
- KB: `collaboration/project-management-tool/host-adapter-extension-guide.md` (the extension guide, with a worked filesystem stub that is executed by the test suite).
