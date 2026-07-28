# Decision: Scaffolded files carry an ownership kind (scaffold-owned vs seed) that drives re-run behavior

## Date

2026-07-28

## Status

Active

## Category

Convention Adoption

## Context

`pair-cli scaffold-kb` (#279) is the first CLI command that **generates a repository** rather than copying a KB into one. Generation must be re-runnable: a maintainer scaffolds a KB, authors content for months, then re-runs the command to pick up an improved release script. Two failure modes had to be excluded by construction:

- Clobbering authored knowledge (the maintainer's `.pair/knowledge/**` / `.skills/**`) because the generator re-emits its seed files.
- Silently discarding a maintainer's edits to a generated file (a customized `.gitignore`, a hand-tuned release script).

`pair install`/`update` already solve a related but different problem via registry `behavior` (`mirror`/`add`/`overwrite`) — that governs copying an *existing* KB onto a target, keyed per registry. It does not describe per-file provenance inside a generated output, so it could not be reused directly.

## Decision

Every file a generator plans carries an explicit **ownership kind**:

- **`scaffold-owned`** — the generator is the author (`pair.config.json`, `README.md`, `.gitignore`, `scripts/release.sh`, `.github/workflows/release.yml`). Regenerated on re-run **only** when the on-disk content differs AND (`--force` OR an interactive confirmation). Otherwise reported as `skipped`.
- **`seed`** — written once so the fresh repo is usable/packageable (`.pair/knowledge/README.md`, `.skills/example-skill/SKILL.md`). Created when absent, **never** overwritten — not even with `--force`.

Byte-identical files are reported as `unchanged`: no write, no prompt, no churn — so a re-run on untouched output is a no-op. With no TTY the confirmation resolves to "no" (keep the file, report it skipped), so nothing is ever silently overwritten in CI or scripts.

The generator emits a plan (`{ path, content, kind }[]`) that is pure and separately testable, and an apply step that turns the plan into per-file outcomes (`created` / `overwritten` / `unchanged` / `skipped`). Confirmation is injected as a function, so idempotency is unit-tested without prompting or mocking a filesystem.

## Alternatives Considered

- **Reuse registry `behavior` (`mirror`/`add`/`overwrite`)**: Rejected. It is a per-registry copy policy for an existing KB, not per-file provenance of generated output; overloading it would make `pair install`'s contract depend on generator concerns.
- **Overwrite everything, tell users to rely on git**: Rejected. Loses uncommitted work and makes "re-scaffold to refresh the release script" a hostile operation; the story's edge cases explicitly require warn-and-ask.
- **Never regenerate anything after the first run (create-only)**: Rejected. Then improvements to the generated release script/workflow could never reach existing KBs, which is the main reason to re-run.
- **A `.scaffold-manifest` recording hashes of what was generated**: Rejected for now — extra state to keep in sync for the same outcome that a content comparison plus the two ownership kinds already give.

## Consequences

- Re-running a generator is safe and boring: unchanged output is a no-op, authored content survives, generated files refresh only deliberately.
- Any future scaffolding command (project, marketplace repo, service template) reuses these two kinds and the same plan/apply split instead of inventing its own overwrite rules; a reviewer can reject a generator that writes files without an ownership kind.
- The report must name every skipped file and why, otherwise the "kept your version" decision is invisible.
- `--force` remains the single explicit escape hatch, and it still cannot touch `seed` content.

## Adoption Impact

- No adoption file change: this is a convention for CLI generators, surfaced here and applied in `apps/pair-cli/src/commands/scaffold-kb/`.
- No knowledge-base/dataset mirror (adoption-only record, consistent with sibling ADLs in this directory).
