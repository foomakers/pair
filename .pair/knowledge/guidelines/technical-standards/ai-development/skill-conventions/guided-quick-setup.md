# Guided / Quick Setup Convention

The shared shape every setup-oriented skill or CLI command uses to expose the same **guided** vs **quick** duality, resolved the same way — so the pattern is documented once instead of re-invented per adopter.

A **setup-oriented** command is any that collects a set of inputs to produce or configure something (package metadata, an adoption decision, a scaffolded project). Two modes, one selector:

- **Guided mode** — asks for inputs one at a time, each pre-filled with a sensible default the user can accept or override. Best UX for a first-time or unfamiliar setup.
- **Quick mode** — accepts KB-sensible defaults in a single shot, no questions. Best for CI, scripting, and experienced users who already know what they want.

## The shared shape

Both modes read from the **same resolved defaults**; the mode only decides whether the user is *asked to confirm* each value (guided) or the values are *taken as-is* (quick). Defaults resolve through a fixed precedence cascade — highest wins:

**explicit argument / flag > project state (package/adoption files) > saved or inferred preferences > hardcoded fallback**

This is the same precedence family as the [resolution cascade](resolution-cascade.md) (Argument > Adoption > Assessment) — an explicit signal always wins over discovered state, which wins over a baked-in default. A setup skill does not invent a third resolution order; it names which sources fill each tier.

## Selecting the mode

Neither mode is universally "the default." Each adopter **declares its own default** from its primary use context; the convention fixes only the *selector direction* and a *non-interactive safety rule* — not which mode wins by default.

- **Selector direction**: an explicit signal selects the *non-default* mode. A guided selector (a `--interactive` flag) opts into guided; a quick selector (an override argument) opts into quick. Absence of any signal → the adopter's declared default.
- **Non-interactive safety**: guided needs a TTY. A detected non-interactive environment (no TTY, CI) can never run guided — the command must fail with a clear message or fall back to quick, and must never hang waiting for input it cannot receive.

The shipped adopters do **not** agree on a default, which is precisely why "guided is always the default" is false:

- `pair package` declares **quick** as its default — a CLI/scripting-first command runs one-shot from resolved defaults, and guided is opt-in via `--interactive`.
- the `assess-*` family declares **guided** as its default (Path C — Full Assessment), and quick is opt-in via an explicit `$choice` override (Path A).
- `bootstrap` declares **guided** as its default — human-facing first-time setup asks rather than assumes — and quick is opt-in via `$mode: quick`. Its per-adopter delta (which decision points are defaultable, which tier fills each, which stay asked) lives beside the skill in `quick-mode-defaults.md`.

Recommended default when adopting: a human-facing, first-time setup skill should lean **guided** (ask rather than silently assume); a scripting-first CLI command should lean **quick**. Whichever is chosen, declare it explicitly rather than leaving it implicit.

## Reference precedents (both already in this repo)

The convention names the shape two pre-existing, independently-evolved implementations already share. It documents them; it does not rewrite them.

### `pair package` — an `--interactive` flag + a `resolveDefaults()` cascade

The `package` CLI command (`apps/pair-cli/src/commands/package/`) is the flag-driven form:

- **Selector**: an `--interactive` / `-i` boolean flag, default `false` (`parser.ts`) — so **quick is this command's declared default**. Absent → quick (one-shot from resolved defaults); present → guided. `--interactive` is the guided selector, not a quick one.
- **Guided flow** (`interactive.ts`, `runInteractiveFlow`): asks for each metadata field in turn (name, version, description, author, tags, license), pre-filled with the resolved default, then previews and confirms. It requires a TTY and throws `Interactive mode requires a terminal (TTY)` otherwise — the "non-interactive environment can't run guided" edge below.
- **Shared defaults cascade** (`defaults-resolver.ts`, `resolveDefaults()` via `resolvePackageDefaults()`): precedence highest→lowest is `cliFlags > packageJson > gitConfig > preferences > hardcoded`. Both modes resolve from this same set — the quick path (`handler.ts`) takes the resolved values verbatim, the guided path pre-fills prompts with them and lets answers override. So `pair package` (no flag) in a repo whose `package.json` name is `foo` yields manifest name `foo`, not the hardcoded `kb-package`.

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
- **Non-interactive environment but guided requested**: an explicit environment signal (no TTY) must override a requested guided mode, but never silently. The generic ideal is to warn and fall back, or fail with a clear message telling the caller to pass the inputs as arguments. `pair package` currently takes the fail path: when its guided flow (`runInteractiveFlow`) detects no TTY it throws `Interactive mode requires a terminal (TTY)` — a clear TTY-required error, without falling back or restating the inputs. The precedence still holds: an explicit environment fact outranks a soft mode preference.
