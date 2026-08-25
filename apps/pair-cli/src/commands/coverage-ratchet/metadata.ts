export const coverageRatchetMetadata = {
  name: 'coverage-ratchet',
  description:
    'Propose a raised coverage baseline as a bot pull request (opt-in commit-back, off by default)',
  usage: 'pair coverage-ratchet --measured <type=pct,...> [options]',
  examples: [
    "pair coverage-ratchet --measured 'backend=87.4'                 # propose from one measured type",
    "pair coverage-ratchet --measured 'backend=87.4,frontend=62' --dry-run   # print the plan, write nothing",
  ],
  options: [
    {
      flags: '--measured <list>',
      description: 'Coverage the run produced, as comma-separated type=pct (required)',
    },
    {
      flags: '--coverage-config <file>',
      description: 'Coverage config to raise [default: .pair/adoption/tech/coverage-baseline.md]',
    },
    {
      flags: '--way-of-working <file>',
      description:
        'File the opt-in flags are read from [default: .pair/adoption/tech/way-of-working.md]',
    },
    {
      flags: '--base-branch <name>',
      description: 'Only a push to this branch may write back [default: main]',
    },
    {
      flags: '--remote <name>',
      description: 'Git remote to push the ratchet branch to [default: origin]',
    },
    {
      flags: '--margin <pp>',
      description: 'Percentage points below the measured value [default: 1]',
    },
    { flags: '--dry-run', description: 'Print the git/gh plan instead of running it' },
  ],
  notes: [
    'Opt-in and nested: it writes only when way-of-working declares BOTH `Coverage guardrail: enabled` and `Coverage baseline commit-back: enabled` (both default off)',
    'Only a push to the base branch writes back — a pull-request run never does, and never mutates a PR head commit',
    'The raise lands as a bot pull request from `chore/coverage-baseline-ratchet`, never as a push to the base branch',
    'Monotonic: a `baseline.<type>` value is only ever raised, edited in place; a first baseline stays a human commit',
    'Needs a repo-scoped COVERAGE_RATCHET_TOKEN (contents: write + pull requests: write, no protection bypass); without it the run warns and the coverage gate verdict is unchanged',
    'A refused write is a warning and exit 0 — persistence can never change the gate verdict; only a malformed invocation exits non-zero',
    'The event/ref it reads (GITHUB_EVENT_NAME, GITHUB_REF_NAME) and the `gh` pull-request call are GitHub-specific',
  ],
} as const
