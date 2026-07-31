# Bootstrap Quick Mode — Per-Decision Defaults

Disclosed from [SKILL.md](SKILL.md) — the `$mode` selector and its two resolution depths. This file is bootstrap's **per-adopter delta** of the Guided / Quick Setup Convention (`.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md`): the convention owns the selector direction, the defaults cascade and the non-interactive safety rule. Bootstrap declares only which of its own decision points are defaultable, which cascade tier fills each, and which are still asked. There is **no bespoke** Quickstart resolution order — nothing below re-invents or re-orders the cascade.

## Selector

`$mode` is the selector, and it points at the non-default depth exactly as the convention prescribes:

- `guided` — bootstrap's declared default. Absent `$mode`, the full interview runs unchanged.
- `quick` — the explicit opt-in signal. No interview: every defaultable decision is resolved from the cascade instead of asked.
- **`guided` is also accepted explicitly — a documented deviation.** The convention fixes the selector's **minimum** (an explicit signal must select the non-default depth) and says nothing about naming the default; bootstrap accepts `$mode: guided` as a loud no-op so a script or a handoff can make the depth visible at the call site. It resolves to exactly the same behaviour as an omitted `$mode`.
- No TTY (CI, piped stdin) is an explicit environment fact and outranks the depth preference: guided can never run there. Bootstrap warns and runs quick instead, and never hangs waiting for input it cannot receive.

## Disclosed deviations

Two, both deliberate and both scoped to bootstrap. They are listed here rather than left implicit because the conventions they deviate from are shared.

1. **`$mode: guided` is accepted as a loud no-op** — see § Selector above. The convention fixes only that an explicit signal must select the **non-default** depth; naming the default is bootstrap's addition.
2. **In quick mode, Path A's confirmation round is not run on composed `assess-*` skills.** The [resolution cascade](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/resolution-cascade.md) defines Path A as `$choice` **plus** a confirmation round (steps 3-4: "Confirm the override with the developer" / "Developer confirms"), and each assess-\* skill declares its own prompt for it. Bootstrap sequences up to eight of them (`assess-orchestration.md`), so running that round would emit up to eight questions inside a depth whose whole point is asking none — and no assess-\* skill currently has a non-interactive signal of its own. Quick mode therefore accepts each resolved `$choice` **as-is** and reports the whole set once, in the Step 4.3 summary; every value stays an ordinary adoption file the developer can edit afterwards (§ Same files, same format as guided). Guided is untouched — it runs Path A exactly as written. The cleaner long-term shape is a first-class non-interactive signal on the assess-\* family itself; that changes eight skills plus the cascade convention, so it belongs to its own story, and this deviation is what bootstrap does until then.

## Cascade tiers, as bootstrap fills them

The convention's precedence, highest wins, with bootstrap's source named per tier:

| Tier (convention)             | What fills it in bootstrap                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| explicit argument             | `$mode`, plus any value the invocation names outright (e.g. the PM tool)                                        |
| project state                 | what is already on disk **excluding** `.pair/adoption/decision-log/` (that is the tier below): `.pair/adoption/tech/**`, `.pair/adoption/product/**`, the PRD, `package.json` and lockfiles, config files, CI workflows, `git config` |
| saved or inferred preferences | what a previous run recorded as a decision rather than as adopted state — the ADLs/ADRs in `.pair/adoption/decision-log/`. A decision-log entry whose value never reached an adoption file is still honoured here, and loses to the adoption file when both exist |
| hardcoded fallback            | `bootstrap-checklist.md` § `Quick-Mode Per-Project-Type Defaults` (and § `Architecture Foundation Assessment → Decision Framework` for the core architectural pattern) — a KB value, never one invented here, and **never** read from § `Context-Specific Examples`, which are worked examples of already-decided projects |

## Per-decision resolution

| Phase / step | Decision point                                                       | Quick mode                                                                                                     | Tier              |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| Phase 0      | PRD present and populated                                            | **never defaulted, and a precondition of the minutes-scale claim** — a populated PRD is read; a missing or template PRD composes `/specify-prd`, an interactive authoring session outside quick mode's question budget (see `Still asked`). HALTs if the PRD is still absent | project state     |
| Step 1.2     | project categorization (Type A/B/C)                                  | derived from PRD signals (team size, budget, compliance) and recorded, not confirmed                            | project state     |
| Step 2.2     | which `assess-*` skills run, and how                                 | installed ones are composed **with** their quick signal (Path A `$choice`), never plain — the family's declared default is guided (Path C). Project state fills `$choice` where it can; otherwise the per-type fallback row below does. **Path A's confirmation round (cascade steps 3-4) is not run** — the resolved `$choice` is accepted as-is and reported once in the Step 4.3 summary (§ Disclosed deviations) | project state     |
| Step 2.3     | architecture section (core pattern, style, data)                     | not asked — `bootstrap-checklist.md` § `Decision Framework` (core pattern) + § `Quick-Mode Per-Project-Type Defaults` rows `Architecture — style` / `— data` | fallback          |
| Step 2.3     | tech stack section (core)                                            | read from project state (`package.json`, lockfiles, config files); **still asked** on an empty repo — the fallback table has no stack row by design | project state     |
| Step 2.3     | testing section of `tech-stack.md` (`/assess-testing`)               | not asked — the **runner follows the resolved stack** (the same answer that filled the core section, never a separate question), the strategy from § `Quick-Mode Per-Project-Type Defaults` row `Testing — strategy` | project state + fallback |
| Step 2.3     | AI section of `tech-stack.md` (`/assess-ai`)                         | not asked — the **assistant/agent tooling follows project state** (`.claude/`, `.cursor/`, `AGENTS.md`, MCP config; on an empty repo, the assistant running bootstrap), the maturity level from § `Quick-Mode Per-Project-Type Defaults` row `AI development tooling` | project state + fallback |
| Step 2.3     | infrastructure + observability sections                              | not asked — § `Quick-Mode Per-Project-Type Defaults` rows `Infrastructure` / `Observability`                    | fallback          |
| Step 2.3     | ux-ui section                                                        | not asked — § `Quick-Mode Per-Project-Type Defaults` row `UX/UI`                                               | fallback          |
| Step 2.3     | way-of-working section (flow, branching, release)                    | not asked — § `Quick-Mode Per-Project-Type Defaults` rows `Way of Working — …`. The PM tool is excluded from this row and still asked (Step 4.2) | fallback          |
| Step 3.1     | adoption documents                                                   | generated and written without the per-document presentation or approval round, for every document (Step 3.1 items 3-4 skipped) | fallback          |
| Step 3.2     | quality gate setup                                                   | standard pipeline only (type check, test, lint, format), no custom gates — same registry entries guided writes  | fallback          |
| Phase 3.5    | domain model (subdomains, bounded contexts)                          | runs when `/map-subdomains` / `/map-contexts` are installed, skipped with a warning otherwise — never blocking  | project state     |
| Step 4.2     | PM tool                                                              | **still asked** unless project state already names one (see below)                                              | explicit argument |
| Step 4.3     | final summary                                                        | printed, not gated on approval                                                                                 | —                 |

## Still asked in quick mode

Quick mode reduces the questions to the genuinely-defaultable ones; it does not eliminate every question unconditionally.

- **PM tool** (Step 4.2) — the choice is organisational, not technical, so no KB value is safe: a wrong guess wires up a tracker nobody uses. Project state resolves it when `way-of-working.md` already names one; otherwise `/setup-pm` is composed and asks that single question.
- **Tech stack when undetectable** (Step 2.3) — normally read from project state (`package.json`, lockfiles, config files). On a genuinely empty repository there is nothing to read and no universally-correct default, so quick mode asks rather than guessing. It is **one** question, not three: `tech-stack.md`'s testing and AI sections are separate `assess-*` invocations, but once the stack is known its test runner follows from it and its AI tooling follows from project state — neither asks again (see the two rows above).
- **The PRD, when absent** (Phase 0) — not a bootstrap question but a whole composed session: `/specify-prd` authors it interactively and iterates to approval. Phase 0 is BLOCKING and identical in both depths, so **a populated PRD is a precondition of the minutes-scale claim**, not something quick mode defaults. Measure or plan quick mode from a project that already has one; on a repo without one, expect the PRD session first.

Everything else in the table above resolves without a question **once the PRD exists**. If one of the two still-asked decisions can neither be resolved from the cascade nor asked (quick mode with no TTY), bootstrap HALTs and names the input to pass explicitly — see SKILL.md.

## Same files, same format as guided (AC4)

Every file quick mode writes is a normal adoption file, in the same location and the same format guided mode would have produced for the same values: `.pair/adoption/tech/*.md`, the Custom Gate Registry in `way-of-working.md`, ADLs/ADRs via `/record-decision`. There is **no quick-mode-only** file, marker, or format — a default installed by quick mode is edited exactly like any other adopted decision, and re-running a phase (or `/record-decision` on that topic) supersedes it.

## Already-configured project

Unchanged from guided mode: each phase checks its own output first, so quick mode confirms rather than overwriting an existing PRD, categorization ADL, adoption file, gate registry, or PM configuration. Detection is the composed capability's own (`/setup-gates`, `/setup-pm`), never a second implementation here.
