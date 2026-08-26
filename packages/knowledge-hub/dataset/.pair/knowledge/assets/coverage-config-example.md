# `tech/coverage-baseline.md` — Example

Illustrative coverage config for a project's `tech/coverage-baseline.md` adoption file. This config exists **only when a project opts into the coverage guardrail** (`Coverage guardrail: enabled` in `way-of-working.md`, via `/pair-capability-setup-gates`) — the guardrail is off by default, so a project without it has no such file. Copy the fenced block into your own adoption file and adjust the numbers — this example is committed only as a reference. The [coverage guardrail](../guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) reads this config with the shipped [`coverage-gate.sh`](coverage-gate.sh) helper.

## What lives here

Two kinds of value, in one parseable `key=value` block (order-independent; lines are read with a plain `^key=` match, so the surrounding markdown fence and headings are ignored):

- **`target.<type>`** — the *gradual* per-type coverage goal (human-set). Below the target but not below the baseline only **warns** — it is not a hard wall (R7.3: incremental improvement, not "must hit X% on day one").
- **`baseline.<type>`** — the *committed* coverage the guardrail protects (**human-committed** — see [Persistence](#persistence-the-baseline-is-human-committed) below). A drop below the baseline **blocks the merge**, at every tier. Leave it unset and the gate runs in **bootstrap-only mode**: it prints the current coverage as a suggested `baseline.<type>=NN` to stderr and passes without blocking, until a human commits that line.
- **`target.default`** — the fallback target for any type without its own `target.<type>` line.
- **`exclude`** — glob(s) for genuinely untestable surface (generated files, config). This is **applied by the adopter to their own coverage tool's config** — the gate does **not** read it and the pipeline snippet does **not** pass it. It is recorded here as the single place the exclusion intent is documented; wiring it into the coverage tool (e.g. istanbul `exclude`, vitest `coverage.exclude`) is the adopter's step.

The `<type>` is the touched code's type — `backend`, `frontend`, `shared`, or whatever your stack distinguishes; the pipeline passes the type matching the code under test so per-type targets apply.

## Persistence: the baseline is human-committed

The guardrail is **live only once a human commits a `baseline.<type>=NN` line** to this file. The gate never persists a baseline itself: a CI checkout is ephemeral, so anything it wrote would be discarded when the runner is torn down — and coverage could then drift down run after run, each run re-suggesting a new lower baseline it never keeps, with the regression guard never firing.

So bootstrapping is **advisory**: on an unset/missing/corrupt baseline the gate prints the suggested `baseline.<type>=NN` to stderr and **passes** (bootstrap-only mode). Read the CI log, copy the suggested line into this committed config, and the guardrail becomes live on the next run. Automated commit-back is a **separate, nested opt-in** (`Coverage baseline commit-back` in `way-of-working.md`, nested under `Coverage guardrail`; both default `disabled`): when enabled, a push to the base branch proposes a *raised* baseline as a bot pull request — never a push to the base branch, never from a pull-request run — and it only ever raises a value, in place. Bootstrapping the *first* baseline stays human either way. Your pipeline runs it as the shipped KB asset `node .pair/knowledge/assets/coverage-ratchet.cjs`, which `/pair-capability-setup-gates` offers only once the guardrail is on and emits only when you say yes.

**The credential is yours to provision.** The step reads `COVERAGE_RATCHET_TOKEN` from its own environment: a **repo-scoped** fine-grained PAT (or GitHub App installation token) with exactly `contents: write` (to push the ratchet branch) and `pull requests: write` (to open/update the ratchet pull request) — **no** `administration` scope, and the identity is **not** added to any branch-protection bypass list. It lives in your repository, so the scope above is guidance, not something this configuration can enforce for you. Without it — or with a token missing one of those two permissions — the step prints a warning **naming the missing credential** and exits 0: this gate's verdict is unchanged, and a coverage run that passed still passes. The default CI token is deliberately not used: a pull request it opens triggers no workflow run, so it could never satisfy required checks.

## KB-sensible defaults

The guardrail is baseline-relative, so absolute targets are advisory. These are sensible starting goals; tune per project:

| Type       | Target | Rationale                                              |
| ---------- | ------ | ------------------------------------------------------ |
| `backend`  | 80     | Business logic / services — the highest test priority. |
| `frontend` | 60     | UI — some surface is exercised by E2E, not unit.       |
| `shared`   | 90     | Reused libraries — a regression here blasts widely.    |
| `default`  | 70     | Anything without a more specific type.                 |

## Example

```ini
# Coverage config — per-type gradual targets (human-set) + committed baseline.
# Leave a baseline.<type> unset to run in bootstrap-only mode (the gate suggests
# a value on stderr and passes; commit it to activate the guardrail).
target.default=70
target.backend=80
target.frontend=60
target.shared=90

# Glob(s) excluded from measurement — applied by the adopter to their coverage
# tool's own config (the gate does not read this key; it is documented here only).
exclude=**/*.generated.ts,**/*.config.ts

# Committed baseline — the guardrail blocks a drop below these. Human-committed:
# unset/empty => bootstrap-only mode (the gate suggests a value on stderr, passes).
baseline.backend=82.5
baseline.frontend=61
# baseline.shared=   (unset => bootstrap-only until a human commits a value)
```

## Notes

- **No coverage tool is mandated.** The gate consumes a coverage percentage the pipeline extracts from whatever the adopted test framework emits (istanbul `coverage-summary.json`, LCOV, Cobertura, …). See the guideline's [coverage guardrail](../guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) section for the extraction snippet per stack.
- **Missing/corrupt baseline** runs in bootstrap-only mode: it suggests a value on stderr and passes with a warning — it never blocks everything, and it never persists a value on its own.
- **No coverage measured** (test tooling emitted nothing / tests did not run) fails safe: it blocks at the red tier and warns at lower tiers, never a silent pass.
