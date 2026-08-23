# opencode

opencode is MCP-native and the only harness in this framework with a persistent headless HTTP server (`opencode serve`). What follows is what pair needs from opencode, not a restatement of its own docs; see <https://opencode.ai/docs/> for anything else.

## 1. Config File Locations

| Location | Scope | Committable |
| --- | --- | --- |
| `~/.config/opencode/config.json` / `opencode.json` / `opencode.jsonc` | Global | No (user machine) |
| Project `opencode.json` / `opencode.jsonc` | Project | **Yes** — no credentials live here |

Credentials are never stored in the config file — opencode's own `auth`/`providers` commands manage them separately (see [Authentication](#4-authentication)).

## 2. Skill-Path Declaration

opencode searches, in order: `.opencode/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md` at the project level (walking up to the git worktree root), and the matching three global paths under `~/.config/opencode/`, `~/.claude/`, `~/.agents/`. So a pair-installed project's skills are already visible with no wiring — this is why the story's original framing ("integrate pi/opencode") had less work than expected: the value is fitness and provisioning, not skill wiring. Confirmed live: running opencode in this repository logs `"duplicate skill name"` warnings for skills present under both `~/.claude/skills/` and `~/.agents/skills/` on the observing machine — direct evidence the discovery walk executes, not just documentation.

## 3. Project Context Loading

opencode uses a winner-takes-all rule per category, never a merge: *"if you have both AGENTS.md and CLAUDE.md, only AGENTS.md is used."* Three categories are checked, each independently: **project** (`AGENTS.md`, falling back to `CLAUDE.md`), **global** (`~/.config/opencode/AGENTS.md`, falling back to `~/.claude/CLAUDE.md`), and **custom** (files named in `opencode.json`'s `instructions` field, which combine additively with the winning `AGENTS.md`). **Context-loading finding: no reduced context variant is needed for opencode** — a repository carrying both `AGENTS.md` and `CLAUDE.md` never loads both from the same category.

## 4. Authentication

- **API key or OAuth**: `opencode auth login|list|logout` (aliased `opencode providers`), or the standard per-provider environment variable (`OPENCODE_API_KEY` for both Zen and Go — see [Model Provider Configuration](#6-model-provider-configuration) — plus the broader per-provider set shared with pi).
- No OAuth subscription in this framework is CI-viable on its first login — the browser handshake is local-interactive by nature; once a token exists (env var, auth file, or opencode Go's persistent API key obtained via `/connect`), reuse is headless.

## 5. Access Paths

**MCP is first-class.** `opencode mcp add|list|auth|logout|debug` manages MCP servers directly — the contrast that makes pi's no-MCP limitation (see [pi.md](pi.md)) a real fitness distinction rather than a framework artifact.

## 6. Model Provider Configuration

Two gateways, **neither is an engine** — engine selection is a separate axis (`--engine`, tracked in #451):

- **Zen** — pay-as-you-go, API-key based, no subscription. Several models are offered free "for a limited time" (observed: Big Pickle, Ox Alpha Free, MiMo-V2.5 Free, Hy3 Free, two Nemotron variants) while the vendor collects feedback. **Data-exposure warning, mandatory alongside this recommendation**: most providers on Zen are zero-retention, but the free/experimental models are the named exception — data may be used to improve the model; OpenAI/Anthropic-backed entries on Zen retain requests 30 days regardless of tier; NVIDIA's free endpoints log sessions for security and product improvement; Meta's Muse Spark trains on prompts/completions unless declined. State the specific provider's disclosure, not a generic "free models log data."
- **Go** — subscription-based, and **spendable headless**: obtain a persistent API key once (`/connect` in the TUI, selecting OpenCode Go), then use it exactly like any other API-key provider (`opencode-go/<model-id>`) — no repeated browser/OAuth step. This resolves the open question the refinement carried into implementation: Go does not inherit the OAuth-per-session constraint that a browser-flow subscription does.

## 7. Headless Execution

`opencode run [message]` for one-shot non-interactive execution (`--format json` for machine-readable output — directly analogous to `claude -p` / `pi -p`); `opencode serve` starts a **persistent headless HTTP server** — the capability neither pi nor Claude Code has in this framework; `opencode attach <url>` drives a running server remotely.

## 8. What opencode Does NOT Support

- Nothing structurally analogous to pi's "no MCP" limitation — MCP is native here.
- No equivalent absence to call out for Claude Code's two-execution-layer split; opencode's headless surface is `run` + `serve`, not a second orchestration layer.

## 9. Verified-Against Version

`opencode@1.18.15`, observed 2026-08-23 on macOS (darwin 25.6.0) via the installed binary's `--help`/`debug config` output, a live `opencode run` in this repository (answered by the free `big-pickle` Zen model under a pre-existing account), and opencode's own hosted docs (`opencode.ai/docs/rules/`, `/docs/zen/`, `/docs/go/`, `/docs/skills/`).
