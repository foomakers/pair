export const runCommandMetadata = {
  name: 'run',
  description: 'Run a pair skill headlessly on a chosen engine, re-invoked until it stops',
  usage: 'pair-cli run [options]',
  examples: [
    'pair-cli run --root 212 --max-iterations 5            # drive the #212 subtree, confirmations active',
    'pair-cli run --engine pi --root 212 --autonomous --max-iterations 3   # eligibility comes from the policy',
    'pair-cli run --skill pair-next --filter risk:green --max-iterations 1 # --filter needs a skill that declares it',
    'pair-cli run --skill pair-next --root 212 --dry-run   # resolve and print, spawn nothing',
    'pair-cli run --prompt "/pair-next --root 212" --max-iterations 1',
  ],
  options: [
    { flags: '--engine <id>', description: 'Engine to run: pi | opencode | claude' },
    {
      flags: '--skill <name>',
      description: 'Skill to invoke (no fallback); default cascades pair-loop → pair-next',
    },
    { flags: '--prompt <text>', description: 'Prompt to run instead of a skill invocation' },
    { flags: '--root <id>', description: 'Scope root passed to the skill (pair-next --root)' },
    {
      flags: '--filter <tag>',
      description:
        'Label filter, for a skill that declares one (pair-next). REFUSED for pair-loop, which reads `## Eligibility` from tech/automation.md itself',
    },
    { flags: '--cwd <dir>', description: 'Working directory every iteration runs in' },
    {
      flags: '--max-iterations <n>',
      description: 'Hard cap on iterations (narrows the policy cap, never widens it)',
    },
    {
      flags: '--autonomous',
      description: 'Explicit opt-in: run without confirmations (never a default)',
    },
    {
      flags: '--approve-project-trust',
      description:
        'Explicit operator authorization to run where the engine does not trust the project',
    },
    {
      flags: '--iteration-timeout <seconds>',
      description: 'Per-iteration wall-clock bound (hang guard, default 1800)',
    },
    {
      flags: '--dry-run',
      description: 'Resolve engine, skill, perimeter and policy, print them, spawn nothing',
    },
  ],
  notes: [
    'A work perimeter is MANDATORY: without a scope (--root/--filter or the policy eligibility filter) and a cap, the run refuses to start',
    'Autonomy and project-trust approval are two separate, explicit opt-ins — neither can be granted by pair.config.json',
    'Every iteration is a fresh engine process and a fresh session; conditions are re-evaluated each time',
    'An iteration outcome comes from the engine event stream, never from its exit code — no terminal event means failed',
    'Policy (eligibility, stop predicate, parallelism, audit) is read from .pair/adoption/tech/automation.md and never written',
    'The driver NEVER merges, in any mode',
  ],
} as const
