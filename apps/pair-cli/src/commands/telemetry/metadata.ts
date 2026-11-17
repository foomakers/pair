/** Commander.js metadata for the telemetry command. */
export const telemetryCommandMetadata = {
  name: 'telemetry',
  description: 'Record a manual in-session delivery step or the final card outcome (source: manual)',
  usage: 'pair-cli telemetry <step|card> --card <id> [options]',
  examples: [
    'pair-cli telemetry step --card 594 --pr 665 --step implement --phase a0 --engine claude --model opus --start 2026-11-17T07:50:00Z --end 2026-11-17T08:33:00Z',
    'pair-cli telemetry card --card 594 --outcome review-approved --end 2026-11-17T09:06:00Z',
  ],
  options: [
    { flags: '<mode>', description: 'step: append a start/end pair; card: write the final card record' },
    { flags: '--root <dir>', description: 'Project root (default: current directory)' },
    { flags: '--card <id>', description: 'Card id' },
    { flags: '--pr <n>', description: 'PR number' },
    { flags: '--step <id>', description: 'Step id (implement, green-fix, verify, ...)' },
    { flags: '--phase <id>', description: 'Phase (a0, r1, ...)' },
    { flags: '--engine <name>', description: 'Engine/runner that did the step' },
    { flags: '--model <name>', description: 'Model (omit when unknown)' },
    { flags: '--effort <level>', description: 'Effort (omit when unknown)' },
    { flags: '--start <time>', description: 'Step start: ISO time or epoch ms' },
    { flags: '--end <time>', description: 'Step end / card final time: ISO time or epoch ms' },
    { flags: '--tokens <f,c,o>', description: 'fresh,cached,out token counts (omit when unknown)' },
    { flags: '--session <id>', description: 'Session id (omit when unknown)' },
    { flags: '--outcome <value>', description: 'Step outcome (default ok) or final card outcome' },
    { flags: '-l, --log-level <level>', description: 'Set minimum log level (debug|info|warn|error)' },
  ],
  notes: [
    'Writes nothing unless telemetry is enabled (## Telemetry in automation.md): same switch as the driver',
    'Unavailable figures are omitted, never estimated; re-running the same step is a no-op',
    'Exit code 0 always: a telemetry problem is a warning, never a failed step',
  ],
} as const
