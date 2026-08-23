# pi

pi (`@earendil-works/pi-coding-agent`, bin `pi`) is the harness with **no MCP by design** in this framework — it proves pair's process does not assume MCP. What follows is what pair needs from pi, not a restatement of pi's own docs; see them at <https://github.com/earendil-works/pi> for anything else.

## 1. Config File Locations

| Location | Scope | Committable |
| --- | --- | --- |
| `~/.pi/agent/settings.json` | Global settings | No (user machine) |
| `~/.pi/agent/auth.json` | Global credentials | **Never** — see [Authentication](#4-authentication) |
| `~/.pi/agent/trust.json` | Global, per-directory project-trust decisions | No |
| `.pi/settings.json` | Project settings | **Yes** — no credentials live here |
| `.pi/SYSTEM.md` / `.pi/APPEND_SYSTEM.md` | Project system-prompt override/append | Yes |
| `.pi/skills`, `.pi/extensions`, `.pi/prompts`, `.pi/themes` | Project resources | Yes |

## 2. Skill-Path Declaration

pi already resolves pair's skills without any wiring: it discovers `.agents/skills/*/SKILL.md`, walking up from the current directory to the git repository root, plus `.pi/skills/` at the project level and `~/.pi/agent/skills/` / `~/.agents/skills/` globally. An explicit `--skill <path>` is also available and is additive even with `--no-skills`. To load another harness's skill directory verbatim (e.g. Claude Code's), add it to `.pi/settings.json`:

```json
{ "skills": ["../.claude/skills"] }
```

**Project-skill discovery requires project trust** — see the headless caveat under [Authentication](#4-authentication) below; this is the one place "already visible" needs a qualifier.

## 3. Project Context Loading

pi loads **one** context file per directory, in this exact precedence: `AGENTS.override.md > AGENTS.md > AGENTS.MD > CLAUDE.md > CLAUDE.MD` — confirmed by reading the installed package's own source (`dist/core/resource-loader.js`), not just its docs. **No duplication**: a repository carrying both `AGENTS.md` and `CLAUDE.md` at its root never has both loaded from that directory — `AGENTS.md` wins and `CLAUDE.md` is not read. Context files layer across directories (global `~/.pi/agent/AGENTS.md`, each parent directory, the cwd), each contributing at most one file. **Context-loading finding: no reduced context variant is needed for pi** — there is nothing to deduplicate.

A personal `~/.pi/agent/AGENTS.md` brings global instructions into every session pi runs, on every project — context the project itself does not control. Know it is there before debugging a session that behaves unexpectedly.

## 4. Authentication

- **API key**: environment variable per provider (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENCODE_API_KEY` for opencode's gateways, and roughly two dozen more) or `~/.pi/agent/auth.json`. Headless-capable — no interactive step required once the variable or file is set.
- **OAuth subscription** (Claude Pro/Max, ChatGPT Plus/Pro, GitHub Copilot, xAI, OpenRouter, Radius): interactive `/login`, token cached in `auth.json` with auto-refresh. **This is a local-interactive path, not a CI path** — there is no non-interactive way to complete the initial OAuth handshake.
- **Headless + project trust (load-bearing, not obvious from "skills are already visible")**: non-interactive modes (`-p`, `--mode json`, `--mode rpc`) never show the trust prompt. With pi's default `defaultProjectTrust: "ask"` (or `"never"`), a headless run **ignores** project-local resources gated by trust, which includes project `.agents/skills` reached via the ancestor-directory walk. Only `defaultProjectTrust: "always"` in `~/.pi/agent/settings.json`, or a saved trust decision for that directory in `~/.pi/agent/trust.json` (written once interactively via pi's own `/trust` command), makes a headless run see project resources the way a trusted interactive session does. This is a **trust configuration**, not a credential — setting it is within `/setup-harness`'s provisioning scope, not a violation of "never touch credentials."

## 5. Access Paths

**No MCP.** Stated in the installed version's own README: *"No MCP. Build CLI tools with READMEs (see Skills), or build an extension that adds MCP support."* This is a deliberate design choice pi documents itself, not an omission. A project whose `tech/automation.md` requires `mcp` access is **not fit** for pi — `/setup-harness`'s fitness check must stop before any configuration write and name this incompatibility precisely.

## 6. Model Provider Configuration

Standard per-provider API-key/OAuth resolution (see [Authentication](#4-authentication)). Notably, **`OPENCODE_API_KEY` is a first-class pi provider variable**, mapped to both opencode's `opencode` (Zen) and `opencode-go` provider IDs — so pi can consume either opencode gateway directly and headlessly with one environment variable, without running opencode itself. Zen is pay-as-you-go and API-key based (headless by construction); Go is subscription-based but obtains a persistent API key via a one-time `/connect` step in opencode's own TUI, after which it behaves like any other API-key provider — see [opencode.md](opencode.md) for the gateway details and the mandatory data-exposure warning that travels with any free-model recommendation.

## 7. Headless Execution

`pi --print` / `-p` for one-shot non-interactive execution; `--mode json` or `--mode rpc` for structured output; `--session-id` / `--session-dir` for scripted session control. Sessions persist as JSONL by default and are shareable via `/share` — a token that ever entered a session's context is a token that can leave the machine through that channel, which is the concrete rationale behind Business Rule 2 (this skill never handles secrets).

## 8. What pi Does NOT Support

- **MCP** (by design — see [Access Paths](#5-access-paths)).
- Sub-agents, permission popups, plan mode, to-dos, and background bash are intentionally absent from the base agent; they are addressable as extensions, not gaps to work around here.
- A built-in sandbox — pi runs with the permissions of the invoking user; isolation for untrusted/unattended work is the operator's responsibility (container, VM, or micro-VM), not something this guide or `/setup-harness` provisions.

## 9. Verified-Against Version

`@earendil-works/pi-coding-agent@0.84.2`, observed 2026-08-23 on macOS (darwin 25.6.0) via the installed package's `--help` output and its own `dist/core/resource-loader.js` source.
