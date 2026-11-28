export const runCommandMetadata = {
  name: 'run',
  description: 'Run a workflow or skill headlessly on a chosen engine',
  usage: 'pair-cli run [workflow] [options]',
  examples: [
    'pair-cli run --skill pair-next --root 212 --dry-run   # resolve and print, spawn nothing',
    'pair-cli run --card 217 --card-tags "auto-dev,risk:green"   # tag-driven: the mapping picks the workflow',
    "pair-cli run --card 487                                # Ready, no mapping: drives or resumes the story's delivery cycle",
    'pair-cli run quick --card 627                           # workflow `quick`: implement, then review, one step at a time (always autonomous; only an escalation stops it)',
    'pair-cli run quick --card 627 --dry-run               # validates the workflow and prints its steps; launches nothing',
    'pair-cli run --card 487 --pr 42                        # enters the cycle at {verify, first, r0} — never prepare',
    'pair-cli run --card 487 --rounds 1                     # bounds remediation to one round, never widened',
    'pair-cli run delivery --root 66 --parallel 3            # run up to 3 independent cards at once',
    "pair-cli run --card 521 --until merged --merge 'hold-when; has: cost:red'   # merge unless escalated; prints every effective value and its source",
  ],
  options: [
    {
      flags: '[workflow]',
      description:
        'Workflow name or file path; select cards with --card, --root, --filter or --assignee. Without a name, defaultWorkflow selects the workflow.',
    },
    { flags: '--engine <id>', description: 'Engine to run: pi | opencode | claude | codex' },
    {
      flags: '--restart',
      description:
        'US-652: with a workflow name, archive the run directory and start the run over (a complete run is otherwise left as it is)',
    },
    {
      flags: '--more-rounds <n>',
      description: 'Grant n further rounds to a workflow loop parked at max',
    },
    {
      flags: '--approve <card>',
      description: 'Approve a parked workflow for this card as the authenticated platform user',
    },
    {
      flags: '--reject <reason>',
      description: 'Reject the parked workflow on --card with a reason',
    },
    {
      flags: '--config <name|file>',
      description:
        'US-672: with a workflow name, the configuration (engine, model, effort per step): a name under `.pair/adoption/tech/configurations/` (else the knowledge-base default) or the path of a file. Without it: `pair.config.json` `workflows.<workflow>.configuration`, then `workflows.default.configuration`, then the engine default',
    },
    {
      flags: '--config-override <json>',
      description:
        'US-672: with a workflow name, a JSON object deep-merged over the configuration, validated like a file and recorded in the run',
    },
    {
      flags: '--reconfigure',
      description:
        "US-672: with a workflow name and --config and/or --config-override, replace the run's frozen configuration; steps already ok are not run again",
    },
    {
      flags: '--skill <name>',
      description: 'Skill to invoke once (no fallback)',
    },
    { flags: '--prompt <text>', description: 'Prompt to run instead of a skill invocation' },
    {
      flags: '--root <id>',
      description:
        'Select descendants of this root for a workflow, or pass the root to a skill that accepts it',
    },
    {
      flags: '--filter <tag>',
      description: 'Select cards by label, or pass a label filter to a skill that accepts it',
    },
    {
      flags: '--assignee <login|@me>',
      description:
        'Select cards assigned to this user, or pass the assignee to a skill that accepts it',
    },
    {
      flags: '--status <macrostates>',
      description:
        'Select cards by canonical state, or pass the states to a skill that accepts them',
    },
    {
      flags: '--preset <full|escalate-red|supervised|custom>',
      description: 'Select an autonomy preset for a card delivery cycle',
    },
    {
      flags: '--until <ready|pr|merged>',
      description: 'Set how far the card delivery cycle proceeds',
    },
    {
      flags: '--prepare <gate>',
      description:
        'Set the card preparation gate: hold-always, hold-never or hold-when with optional label conditions',
    },
    {
      flags: '--merge <gate>',
      description:
        'Set the card merge gate: hold-always, hold-never or hold-when with optional label conditions',
    },
    {
      flags: '--card <id>',
      description:
        'Dispatch or resume this card: process faults use recorded recovery and a resume token; its tag selects the workflow from `## Workflows` in tech/automation.md (cannot be combined with --skill/--prompt)',
    },
    {
      flags: '--telemetry',
      description:
        'Record local per-stage and per-card telemetry; overrides ## Telemetry adoption setting. With a workflow name: record per-step telemetry.jsonl in the run directory (off without it)',
    },
    {
      flags: '--no-telemetry',
      description: 'Disable local telemetry for this run; overrides ## Telemetry adoption setting',
    },
    {
      flags: '--card-tags <list>',
      description:
        "Comma-separated labels the trigger observed on --card — an explicit override. Absent with --autonomous ⇒ the card's live labels are read from the tracker (unreadable ⇒ fails closed, nothing runs); empty (an unlabelled card) or unmapped ⇒ the readiness fallback decides (US-487 AC14): the board state through `## State Mapping`; Draft/Ready-without-breakdown routes to the matching prep skill (skipped under --autonomous), Ready starts the delivery-cycle coordinator",
    },
    {
      flags: '--pr <n>',
      description:
        'US-487: enters the delivery-cycle coordinator at its review stage ({verify, first, r0}), never prepare (requires --card)',
    },
    {
      flags: '--rounds <n|max>',
      description:
        "US-487: bounds the delivery cycle's remediation rounds — never widened past the policy's maxFixRounds (requires --card)",
    },
    {
      flags: '--run-id <id>',
      description:
        "US-487: the delivery cycle's run identity; defaults to story-<card> (requires --card). US-652: with a workflow name, the run directory `.pair/working/runs/<id>`; defaults to <workflow>-<card>",
    },
    {
      flags: '--parallel <n>',
      description: 'Maximum concurrent cards in a workflow run',
    },
    { flags: '--cwd <dir>', description: 'Working directory for the run' },
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
      flags: '--approve-ineligible',
      description:
        'Explicit operator authorization for THIS --autonomous run on a card `## Eligibility` would exclude (announced, never persisted)',
    },
    {
      flags: '--eligibility-filter <labels>',
      description: 'Override the eligibility filter for this card run',
    },
    {
      flags: '--iteration-timeout <seconds>',
      description: 'Maximum wall-clock duration for one engine invocation',
    },
    {
      flags: '--idle-timeout <seconds>',
      description: 'Stop an engine invocation after this duration without an event',
    },
    {
      flags: '--quiet',
      description: 'Print plain progress without live card lines',
    },
    {
      flags: '--verbose',
      description:
        "Live terminal: also print the driver's technical lines (stage records, dispatch records, banner)",
    },
    {
      flags: '--json',
      description: 'Emit the run events as NDJSON on stdout (human text goes to stderr)',
    },
    {
      flags: '--no-color',
      description: 'No ANSI colors in live progress (NO_COLOR is honoured too)',
    },
    {
      flags: '--profile <name>',
      description: 'Select stage engine, model, effort and context for a card or skill run',
    },
    {
      flags: '--workflow-config <path>',
      description: 'Select an external workflow profile for a card or skill run',
    },
    {
      flags: '--dry-run',
      description: 'Resolve engine, skill, perimeter and policy, print them, spawn nothing',
    },
  ],
  notes: [
    'A named workflow selects and runs cards according to its configuration',
    'A skill or prompt runs once; --dry-run launches nothing',
    'An unscoped workflow previews its cards and requires terminal confirmation',
    'Autonomy and project-trust approval are separate, explicit opt-ins',
    'engine.bin and engine.model in pair.config.json configure the executable and model',
  ],
} as const
