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
    'pair-cli run --card 217 --card-tags "auto-dev,risk:green"   # tag-driven: the mapping picks the workflow',
    "pair-cli run --card 487                                # Ready, no mapping: drives this story's own delivery cycle",
    'pair-cli run --card 487 --pr 42                        # enters the cycle at {verify, first, r0} — never prepare',
    'pair-cli run --card 487 --rounds 1                     # bounds remediation to one round, never widened',
    'pair-cli run --root 66 --parallel 3 --autonomous       # fan-out: up to 3 `run --card` processes at once',
    'pair-cli run --filter PIPPO --assignee @me --parallel 2 --watch --interval 10m   # portable loop: re-selects each iteration',
    "pair-cli run --card 521 --until merged --merge 'when; has: cost:red'   # merge unless escalated; prints every effective value and its source",
    'pair-cli run --skill pair-next --filter risk:green,risk:yellow --assignee @me --status Draft,Ready --max-iterations 1',
  ],
  options: [
    { flags: '--engine <id>', description: 'Engine to run: pi | opencode | claude | codex' },
    {
      flags: '--skill <name>',
      description: 'Skill to invoke (no fallback); default cascades pair-loop → pair-next',
    },
    { flags: '--prompt <text>', description: 'Prompt to run instead of a skill invocation' },
    { flags: '--root <id>', description: 'Scope root passed to the skill (pair-next --root)' },
    {
      flags: '--filter <tag>',
      description:
        'Label filter, for a skill that declares one (pair-next): one label or a comma-separated any-of list (risk:green,risk:yellow). REFUSED for pair-loop, which reads `## Eligibility` from tech/automation.md itself',
    },
    {
      flags: '--assignee <login|@me>',
      description:
        'US-521: keep issues assigned to this user (@me = the authenticated code-host user), for a skill that declares it (pair-next); refused for pair-loop until #524',
    },
    {
      flags: '--status <macrostates>',
      description:
        'US-521: comma-separated canonical macrostates (e.g. Draft,Ready), for a skill that declares it (pair-next); refused for pair-loop until #524',
    },
    {
      flags: '--until <ready|pr|merged>',
      description:
        "US-521: how far the card's delivery cycle goes — ready (stop before implement), pr (default: the review-approved PR), merged (enter the merge stage; the only value that evaluates the merge gate). Requires --card. Precedence: argument > adoption (`## Autonomy`, then translated legacy sections) > KB default — every effective value is printed with its source.",
    },
    {
      flags: '--prepare <gate>',
      description:
        'US-521: the prepare gate `<always|never|when>[; has: <labels>][; lacks: <labels>]` — parsed and validated, execution lands in #523 (treated as always). Requires --card',
    },
    {
      flags: '--merge <gate>',
      description:
        "US-521: the merge gate, same grammar: always parks awaiting-human (default), never/when enter the merge stage unless a has/lacks escalation fires (status escalated, exit 1, on-halt). #490's signal checks stay mandatory. Requires --card",
    },
    {
      flags: '--card <id>',
      description:
        'Dispatch this card: its tag selects the workflow from `## Workflows` in tech/automation.md (cannot be combined with --skill/--prompt)',
    },
    {
      flags: '--card-tags <list>',
      description:
        'Comma-separated labels the trigger observed on --card. Absent, empty (an unlabelled card) or unmapped ⇒ the readiness fallback decides (US-487 AC14): the board state through `## State Mapping`; Draft/Ready-without-breakdown routes to the matching prep skill (skipped under --autonomous), Ready starts the delivery-cycle coordinator',
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
        "US-487: the delivery cycle's run identity; defaults to story-<card> (requires --card)",
    },
    {
      flags: '--parallel <n>',
      description:
        "US-491: fan-out — pair-next selects (--root and/or --filter, --assignee, --status), pair-loop's dependency + mutex analysis plans, and up to min(dependency-allowed, ## Max Parallelism, n) `pair-cli run --card` processes run at once; one iteration, or a re-selecting loop with --watch / --max-iterations (US-522). Needs --root or --filter (or the policy's); not with --card/--skill/--prompt",
    },
    {
      flags: '--watch',
      description:
        'US-522: with --parallel, loop: each iteration re-selects (skipping escalated, locked and already-driven cards), and an idle one waits --interval and re-selects. Stops at the Stop Predicate, the iteration cap (idle polls count) or Ctrl-C. Needs --parallel (--parallel 1 for sequential)',
    },
    {
      flags: '--no-watch',
      description:
        'US-522: explicitly no watch loop (the default; refused together with --watch)',
    },
    {
      flags: '--interval <n>s|m|h',
      description:
        'US-522: the idle wait under --watch (default 10m, at least 60s); requires --watch',
    },
    { flags: '--cwd <dir>', description: 'Working directory every iteration runs in' },
    {
      flags: '--max-iterations <n>',
      description:
        'Hard cap on iterations (narrows the policy cap, never widens it); with --parallel it enables the re-selecting loop, idle polls included',
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
      flags: '--approve-ineligible',
      description:
        'Explicit operator authorization for THIS --autonomous run on a card `## Eligibility` would exclude (announced, never persisted)',
    },
    {
      flags: '--iteration-timeout <seconds>',
      description: 'Per-iteration wall-clock bound (hang guard, default 1800)',
    },
    {
      flags: '--profile <name>',
      description:
        'With --card: the named workflow profile (per-stage engine/model/effort/context) from pair.config.json workflowProfiles; an unknown name halts profile-unresolved',
    },
    {
      flags: '--workflow-config <path>',
      description:
        'With --card: an external workflow profile file, used verbatim — wins over --profile and pair.config.json',
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
    'Tag-driven dispatch is opt-in per card: a card with no mapped tag is never routed to a mapped workflow; an ineligible card is skipped',
    'No mapped tag ⇒ the card readiness decides: Ready ⇒ the delivery cycle; Draft/no breakdown ⇒ prep skill (never under --autonomous); unmapped/Done or an unreadable card with no mapping ⇒ clean skip',
    'Under --autonomous, `## Eligibility` bounds the fallback too (--approve-ineligible overrides one run); --pr enters the cycle at review',
    'Every route that spawns on a card takes an exclusive per-card lock: a trigger burst never starts a second run on the same card',
    '--root --parallel prints the plan (run / excluded and why / effective limit and what bound it) before any process starts; one card failing never aborts the others, and one batch summary line is appended to the audit file',
    '--parallel --watch prints each effective loop value with its source, then ONE line per iteration, and appends event=loop-start / iteration / loop-end lines to the audit file; escalated and locked cards are skipped, a card driven once is never re-driven in the same run; a failed selection stops the loop (exit 1), never retried',
    'engine.bin / engine.model in pair.config.json: per-machine executable path and run-wide model, keyed by engine id',
  ],
} as const
