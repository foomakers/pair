# Guided / Quick Setup Convention

The shared shape every setup-oriented skill or CLI command uses to expose the same **guided** vs **quick** duality, resolved the same way — so the pattern is documented once instead of re-invented per adopter.

A **setup-oriented** command is any that collects a set of inputs to produce or configure something (package metadata, an adoption decision, a scaffolded project). Two modes, one selector:

- **Guided mode** — asks for inputs one at a time, each pre-filled with a sensible default the user can accept or override. Best UX for a first-time or unfamiliar setup; the safe default for a standalone invocation.
- **Quick mode** — accepts KB-sensible defaults in a single shot, no questions. Best for CI, scripting, and experienced users who already know what they want.

## The shared shape

Both modes read from the **same resolved defaults**; the mode only decides whether the user is *asked to confirm* each value (guided) or the values are *taken as-is* (quick). Defaults resolve through a fixed precedence cascade — highest wins:

**explicit argument / flag > project state (package/adoption files) > saved or inferred preferences > hardcoded fallback**

This is the same precedence family as the [resolution cascade](resolution-cascade.md) (Argument > Adoption > Assessment) — an explicit signal always wins over discovered state, which wins over a baked-in default. A setup skill does not invent a third resolution order; it names which sources fill each tier.

## Selecting the mode

**Convention over configuration: guided is the default; quick requires an explicit signal** — never the reverse. A standalone, first-time invocation should ask rather than silently assume. Quick mode is entered only on an explicit signal:

- a flag or argument the caller passes (`--interactive` / an override argument), or
- a detected non-interactive environment (no TTY, CI) that makes asking impossible.

The safe direction is one-way: absence of any signal → guided; an explicit quick signal → quick.

## Reference precedents (both already in this repo)

The convention names the shape two pre-existing, independently-evolved implementations already share. It documents them; it does not rewrite them.

### `pair package` — an `--interactive` flag + a `resolveDefaults()` cascade

The `package` CLI command (`apps/pair-cli/src/commands/package/`) is the flag-driven form:

- **Selector**: an `--interactive` / `-i` boolean flag, default `false` (`parser.ts`). Absent → quick (one-shot from resolved defaults); present → guided.
- **Guided flow** (`interactive.ts`): asks for each metadata field in turn (name, version, description, author, tags, license), pre-filled with the resolved default, then previews and confirms. It requires a TTY and errors out otherwise — the "non-interactive environment can't run guided" edge below.
- **Defaults cascade** (`defaults-resolver.ts`, `resolveDefaults()`): precedence highest→lowest is `cliFlags > packageJson > gitConfig > preferences > hardcoded`. Both modes consume this same resolved set; guided pre-fills prompts with it, quick takes it verbatim.

### The `assess-*` family — the Resolution Cascade

The `assess-*` skills are the argument-driven form of the same duality, expressed as the [resolution cascade](resolution-cascade.md):

- **Path A — Argument Override** is the quick signal: an explicit `$choice` short-circuits the questions.
- **Path C — Full Assessment** is the guided form: no override, so the skill runs its full ask-and-evaluate algorithm.
- **Path B — Existing State** sits between them, reusing already-adopted state instead of re-asking.

Path A vs Path C is exactly the quick vs guided split; Path B is the "already resolved, don't ask again" idempotency tier.

## Per-adopter delta (what stays in the skill, not here)

A future setup skill adopts this convention directly and keeps only its own specifics:

- The concrete selector — which flag, argument, or environment probe signals quick.
- Which sources fill each cascade tier (what plays the role of `package.json`, git config, saved preferences).
- The exact prompts guided mode asks, and their per-field defaults.

## Edge cases

- **A third mode is genuinely needed** (e.g. partially-guided): the two-mode shape is the default. A skill with a real need for more documents its deviation explicitly under its own heading rather than silently diverging — same discipline the cascade uses for per-skill deltas.
- **Non-interactive environment but guided requested**: an explicit environment signal (no TTY) may override a requested guided mode, but never silently. Either warn and fall back, or fail with a clear message telling the caller to pass the inputs as arguments — as `pair package`'s guided flow does when it detects no TTY. The precedence still holds: an explicit environment fact outranks a soft mode preference.
