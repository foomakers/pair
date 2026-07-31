# Bootstrap Quick Mode — Per-Decision Defaults

Disclosed from [SKILL.md](./SKILL.md) — the `$mode` selector and its two resolution depths. This file is bootstrap's **per-adopter delta** of the Guided / Quick Setup Convention (`.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md`): the convention owns the selector direction, the defaults cascade and the non-interactive safety rule. Bootstrap declares only which of its own decision points are defaultable, which cascade tier fills each, and which are still asked. There is **no bespoke** Quickstart resolution order — nothing below re-invents or re-orders the cascade.

## Selector

`$mode` is the selector, and it points at the non-default depth exactly as the convention prescribes:

- `guided` — bootstrap's declared default. Absent `$mode`, the full interview runs unchanged.
- `quick` — the explicit opt-in signal. No interview: every defaultable decision is resolved from the cascade instead of asked.
- No TTY (CI, piped stdin) is an explicit environment fact and outranks the depth preference: guided can never run there. Bootstrap warns and runs quick instead, and never hangs waiting for input it cannot receive.

## Cascade tiers, as bootstrap fills them

The convention's precedence, highest wins, with bootstrap's source named per tier:

| Tier (convention)             | What fills it in bootstrap                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| explicit argument             | `$mode`, plus any value the invocation names outright (e.g. the PM tool)                                        |
| project state                 | what is already on disk: `.pair/adoption/**`, the PRD, `package.json` and lockfiles, CI workflows, `git config` |
| saved or inferred preferences | decisions a previous run recorded — the ADLs/ADRs in `.pair/adoption/decision-log/`                             |
| hardcoded fallback            | the per-project-type defaults in `bootstrap-checklist.md` — a KB value, never one invented here                 |

## Per-decision resolution

| Phase / step | Decision point                                                       | Quick mode                                                                                                     | Tier              |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| Phase 0      | PRD present and populated                                            | never defaulted — composes `/pair-process-specify-prd` when missing, HALTs if the PRD is still absent                        | project state     |
| Step 1.2     | project categorization (Type A/B/C)                                  | derived from PRD signals (team size, budget, compliance) and recorded, not confirmed                            | project state     |
| Step 2.2     | which `assess-*` skills run                                          | installed ones run with their own quick signal (Path A `$choice`) where project state resolves the choice       | project state     |
| Step 2.3     | per-section questions (architecture, stack, infrastructure, ux-ui, way-of-working) | not asked — each section is filled from the project-type defaults, except an undetectable stack (still asked)   | fallback          |
| Step 3.1     | adoption documents                                                   | generated and written without the per-document approval round                                                  | fallback          |
| Step 3.2     | quality gate setup                                                   | standard pipeline only (type check, test, lint, format), no custom gates — same registry entries guided writes  | fallback          |
| Phase 3.5    | domain model (subdomains, bounded contexts)                          | runs when `/pair-capability-map-subdomains` / `/pair-capability-map-contexts` are installed, skipped with a warning otherwise — never blocking  | project state     |
| Step 4.2     | PM tool                                                              | **still asked** unless project state already names one (see below)                                              | explicit argument |
| Step 4.3     | final summary                                                        | printed, not gated on approval                                                                                 | —                 |

## Still asked in quick mode

Quick mode reduces the questions to the genuinely-defaultable ones; it does not eliminate every question unconditionally.

- **PM tool** (Step 4.2) — the choice is organisational, not technical, so no KB value is safe: a wrong guess wires up a tracker nobody uses. Project state resolves it when `way-of-working.md` already names one; otherwise `/pair-capability-setup-pm` is composed and asks that single question.
- **Tech stack when undetectable** (Step 2.3) — normally read from project state (`package.json`, lockfiles, config files). On a genuinely empty repository there is nothing to read and no universally-correct default, so quick mode asks rather than guessing.

Everything else in the table above resolves without a question. If one of these two can neither be resolved from the cascade nor asked (quick mode with no TTY), bootstrap HALTs and names the input to pass explicitly — see SKILL.md.

## Same files, same format as guided (AC4)

Every file quick mode writes is a normal adoption file, in the same location and the same format guided mode would have produced for the same values: `.pair/adoption/tech/*.md`, the Custom Gate Registry in `way-of-working.md`, ADLs/ADRs via `/pair-capability-record-decision`. There is **no quick-mode-only** file, marker, or format — a default installed by quick mode is edited exactly like any other adopted decision, and re-running a phase (or `/pair-capability-record-decision` on that topic) supersedes it.

## Already-configured project

Unchanged from guided mode: each phase checks its own output first, so quick mode confirms rather than overwriting an existing PRD, categorization ADL, adoption file, gate registry, or PM configuration. Detection is the composed capability's own (`/pair-capability-setup-gates`, `/pair-capability-setup-pm`), never a second implementation here.
