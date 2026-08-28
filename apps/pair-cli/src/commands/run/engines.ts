/**
 * The engine map — supported execution engines as DATA (US-451 T-2).
 *
 * One frozen record, keyed by engine id, is the whole of the CLI's engine knowledge:
 * executable, headless/stream flags, how a skill invocation and a prompt are handed over,
 * the autonomy and project-trust postures, and the terminal-event rules the stream reader
 * matches. Nothing else in the driver may branch on an engine id — the risk table in the
 * story records why (adding an engine must stay a DATA edit, so moving this map into the
 * KB later is a source swap, not a refactor).
 *
 * Every value here was read off the engine itself or off its harness guide
 * (`.pair/knowledge/guidelines/technical-standards/ai-development/agent-harness/`), never
 * guessed: `claude --help` / a live `claude -p … --output-format stream-json` run,
 * `opencode run --help` / a live `opencode run --format json` run, and pi's own
 * `dist/modes/print-mode.js` + `dist/core/agent-session.js` (`@earendil-works/pi-coding-agent@0.84.3`),
 * observed 2026-08-24. An engine whose terminal event could not be verified would have to
 * ship with NO rule at all, which is fail-closed by construction (AC7): with nothing to
 * match, every iteration reads as failed and the loop stops.
 */

/** Engine ids this CLI knows. Adding one is a data edit in `ENGINES` below. */
export const ENGINE_IDS = ['pi', 'opencode', 'claude'] as const

export type EngineId = (typeof ENGINE_IDS)[number]

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value)
}

/**
 * How a recognised terminal event is spotted in the JSONL stream, as data.
 *
 * `match` is a set of dotted field paths that must ALL equal the given scalar for the line
 * to BE the terminal event; `successWhen`, when present, decides the outcome of a line that
 * already matched. A line matching neither is not terminal, and a stream carrying no
 * terminal line at all is a FAILED iteration (AC7) — the exit code is never consulted.
 */
export interface TerminalEventRule {
  readonly match: Readonly<Record<string, string | number | boolean>>
  readonly successWhen?: Readonly<Record<string, string | number | boolean>>
  /** Dotted path to a human-readable detail carried by the terminal event, when it has one. */
  readonly detailField?: string
}

/**
 * How the engine is told to run a pair skill.
 *
 * `slash` is the in-agent slash-command form (`/pair-loop --root 212`); `instruction` is the
 * portable natural-language form for engines that discover skills but expose no slash
 * syntax on a one-shot prompt. Both are prompt TEXT handed over as a single argv element —
 * never interpolated into a shell string (T-4).
 */
export type SkillInvocationStyle = 'slash' | 'instruction'

/**
 * Whether the driver can decide project trust for this engine, and how.
 *
 * - `headless-implicit`: the engine documents that its trust dialog is skipped in
 *   non-interactive mode, so there is no trust decision the driver could make or bypass.
 * - `none`: the engine has no project-trust concept.
 * - `provisioned`: trust lives in a store the engine (or `/pair-capability-setup-harness`)
 *   owns. The driver NEVER writes it — running against an unprovisioned project is an
 *   operator decision, taken with `--approve-project-trust` and printed (AC6).
 */
export type ProjectTrustPosture =
  | { readonly kind: 'headless-implicit'; readonly note: string }
  | { readonly kind: 'none'; readonly note: string }
  | { readonly kind: 'provisioned'; readonly store: string; readonly note: string }

/**
 * Whether confirmations can be kept ON for this engine.
 *
 * - `flag`: the engine confirms by default and `autonomyArgs` is the explicit opt-out.
 * - `always-on`: the engine has NO confirmation mechanism, so running it at all is an
 *   autonomy decision — the driver requires `--autonomous` explicitly rather than
 *   pretending confirmations are active (AC6, fail-loudly side).
 */
export type AutonomyPosture =
  | { readonly kind: 'flag'; readonly autonomyArgs: readonly string[] }
  | { readonly kind: 'always-on'; readonly note: string }

export interface EngineDefinition {
  readonly id: EngineId
  /** The executable, as it must be found on PATH. */
  readonly command: string
  /** Args that put the engine in one-shot headless mode and make it emit JSONL. */
  readonly headlessArgs: readonly string[]
  /** Flag carrying the working directory, when the engine has one (`undefined` ⇒ spawn cwd). */
  readonly cwdFlag?: string
  readonly skillInvocationStyle: SkillInvocationStyle
  readonly autonomy: AutonomyPosture
  readonly projectTrust: ProjectTrustPosture
  readonly terminalEvents: readonly TerminalEventRule[]
  /** Where this entry's values were verified. Printed nowhere; read by the next maintainer. */
  readonly verifiedAgainst: string
}

/**
 * pi — `pi --mode json "<prompt>"`.
 *
 * Terminal event: `agent_settled`, emitted once per settled agent run by
 * `AgentSession._emitAgentSettled` and forwarded verbatim to stdout by print mode's JSON
 * subscriber. pi documents no exit-code contract, which is the reason AC7 exists.
 *
 * pi has no permission prompts at all ("permission popups … intentionally absent", pi.md
 * §8) and no CLI trust flag: project trust is a per-directory decision in
 * `~/.pi/agent/trust.json` (pi.md §4).
 */
const PI: EngineDefinition = {
  id: 'pi',
  command: 'pi',
  headlessArgs: ['--mode', 'json'],
  skillInvocationStyle: 'instruction',
  autonomy: {
    kind: 'always-on',
    note: 'pi has no permission prompts (agent-harness/pi.md §8), so it cannot run with confirmations active',
  },
  projectTrust: {
    kind: 'provisioned',
    store: '~/.pi/agent/trust.json',
    note: 'a headless pi run silently ignores project-local resources of an untrusted project (agent-harness/pi.md §4)',
  },
  terminalEvents: [{ match: { type: 'agent_settled' } }],
  verifiedAgainst:
    '@earendil-works/pi-coding-agent@0.84.3 (dist/modes/print-mode.js, dist/core/agent-session.js)',
}

/**
 * opencode — `opencode run --format json "<prompt>"`.
 *
 * Terminal event: a `step_finish` whose `part.reason` is `stop`. Intermediate steps carry
 * another reason (`tool-calls`), so they do not match and are not terminal — verified on a
 * live run, whose stream was `step_start` → `text` → `step_finish{part.reason:"stop"}`.
 */
const OPENCODE: EngineDefinition = {
  id: 'opencode',
  command: 'opencode',
  headlessArgs: ['run', '--format', 'json'],
  cwdFlag: '--dir',
  skillInvocationStyle: 'instruction',
  autonomy: { kind: 'flag', autonomyArgs: ['--auto'] },
  projectTrust: {
    kind: 'none',
    note: 'opencode has no project-trust gate (agent-harness/opencode.md)',
  },
  terminalEvents: [{ match: { type: 'step_finish', 'part.reason': 'stop' } }],
  verifiedAgainst: 'opencode@1.18.15 (`opencode run --help`, live `opencode run --format json`)',
}

/**
 * Claude Code — `claude -p "<prompt>" --output-format stream-json --verbose`.
 *
 * One engine among others, deliberately: the control test in the story's Validation Strategy
 * only exists because the driver can be pointed at the executor this project already trusts.
 *
 * Terminal event: `{"type":"result", "subtype":"success"|…}` — verified on a live run.
 * `-p` also documents that "the workspace trust dialog is skipped in non-interactive mode",
 * so there is no trust decision here for the driver to take.
 */
const CLAUDE: EngineDefinition = {
  id: 'claude',
  command: 'claude',
  headlessArgs: ['-p', '--output-format', 'stream-json', '--verbose'],
  skillInvocationStyle: 'slash',
  autonomy: { kind: 'flag', autonomyArgs: ['--permission-mode', 'bypassPermissions'] },
  projectTrust: {
    kind: 'headless-implicit',
    note: 'claude -p skips the workspace trust dialog (claude --help)',
  },
  terminalEvents: [
    { match: { type: 'result' }, successWhen: { subtype: 'success' }, detailField: 'subtype' },
  ],
  verifiedAgainst: 'claude --help + live `claude -p --output-format stream-json` (2026-08-24)',
}

export const ENGINES: Readonly<Record<EngineId, EngineDefinition>> = Object.freeze({
  pi: PI,
  opencode: OPENCODE,
  claude: CLAUDE,
})

/**
 * The engine used when neither a flag nor `pair.config.json` names one (AC12 — a repository
 * with no config file runs from this schema default).
 *
 * `claude` is the default because it is the engine this project's own delivery is validated
 * against (the control test), not because it is privileged: the whole point of the driver is
 * that the default is one line of data.
 */
export const DEFAULT_ENGINE_ID: EngineId = 'claude'
