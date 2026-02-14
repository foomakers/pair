# Decision: Delete prompts instead of deprecation notices

## Date

2026-02-14

## Status

Active

## Category

Process Decision

## Context

Story #105 originally planned a transition period for `.github/prompts/` — keep files with deprecation notices pointing to the equivalent Agent Skill. With all 30 skills implemented and installed, the prompts are fully superseded. Keeping dead files with deprecation notices adds maintenance overhead (syncing, linting, config includes) without practical benefit: no external consumers depend on the prompts, and all agent files already reference skills.

## Decision

Delete `.github/prompts/` entirely (32 files) instead of adding deprecation notices. Product owner decision — the transition period is unnecessary because skills fully replace prompts and all entry points (AGENTS.md, `.github/agents/`, CLAUDE.md) already reference skills.

## Alternatives Considered

- **Deprecation notices (original AC-16 plan)**: Keep prompt files with a header pointing to the skill equivalent. Not chosen — adds maintenance overhead for zero benefit since no consumers depend on prompts.
- **Partial deletion**: Delete only prompt files with exact skill equivalents, keep others. Not chosen — all prompts have skill equivalents, so partial deletion has no advantage.

## Consequences

- `.github/prompts/` directory no longer exists in the repository or installed copies.
- `config.json` updated to remove `/prompts` from the `github` registry `include` array.
- `.prettierignore` updated to remove the prompts pattern.
- `backup-service.test.ts` fixtures updated to remove prompts references.
- No transition period — immediate removal. Any user referencing old prompt names gets a "not found" rather than a deprecation notice.

## Adoption Impact

- `config.json`: `/prompts` removed from `github.include` array — already applied in this PR.
- No adoption file update needed — prompts were not tracked in adoption files.
