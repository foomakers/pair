# Claude Code

Claude Code is the control case in this framework — the harness pair was built on. Writing its guide against the same nine-section index as pi and opencode is what proves the index is a real abstraction rather than a description of one product. What follows is what pair needs from Claude Code; see its own documentation for anything else.

## 1. Config File Locations

| Location | Scope | Committable |
| --- | --- | --- |
| `~/.claude/settings.json` | Global settings | No (user machine) |
| `.claude/settings.json` | Project settings | Yes |
| `.claude/settings.local.json` | Project, personal overrides | No (gitignored by convention) |
| `CLAUDE.md` (project) / `~/.claude/CLAUDE.md` (global) | Context | Yes (project) |
| `.mcp.json` | Project MCP server declarations | Yes |

## 2. Skill-Path Declaration

`.claude/skills/*/SKILL.md` is the canonical target of pair's own distribution (ADR-005): the CLI writes a physical copy there and symlinks the five secondary targets to it. No additional wiring is needed for a pair-installed project.

## 3. Project Context Loading

Claude Code reads `CLAUDE.md` at project and user level (with `@path` inline imports); it does not read `AGENTS.md` itself. **No context-loading duplication risk here**: pair's own dataset keeps `AGENTS.md` as the full authored source and generates `CLAUDE.md` as the transform-reduced mirror via the existing skip-marker pipeline (`packages/content-ops/src/ops/content-transform.ts`) — Claude Code only ever reads the one file meant for it, never both.

## 4. Authentication

- **OAuth subscription**: interactive `/login` against a Claude subscription. Local-interactive, not a CI path.
- **API key**: `ANTHROPIC_API_KEY` environment variable. Headless-capable.

## 5. Access Paths

**MCP is first-class**: `claude mcp add|list|...`, plus `--mcp-config`/`--strict-mcp-config` for headless invocations that need MCP servers without the interactive `mcp` subcommands.

## 6. Model Provider Configuration

Anthropic-direct is the primary path (subscription or `ANTHROPIC_API_KEY`); Claude Code does not route through opencode's Zen/Go gateways the way pi does — those are documented as pi/opencode-specific in this framework, not restated here.

## 7. Headless Execution — Two Distinct Layers

- **`claude -p`** — one-shot, non-interactive: process a prompt and exit. Supports `--output-format json|stream-json` and `--input-format stream-json` for scripted, streaming invocations. The workspace-trust dialog is automatically skipped in non-interactive mode.
- **`Workflow`** — multi-agent orchestration available *inside* a running session, not a separate CLI invocation. Use `-p` when the need is "run once, get one answer, exit" (a scripted or CI step); use `Workflow` when the need is "fan out across many subagents inside one live session" (a comprehensive review, a multi-file migration, a research sweep). They are not interchangeable: `-p` cannot orchestrate sub-agents, and `Workflow` is not a standalone CLI entrypoint.

## 8. What Claude Code Does NOT Support

- No persistent headless HTTP server equivalent to opencode's `opencode serve` at the CLI level covered by this guide (a separate SDK-server product surface exists but is out of scope here).

## 9. Verified-Against Version

`2.1.239 (Claude Code)`, observed 2026-08-23 via the installed CLI's own `--version`, `--help`, and `mcp --help` output.
