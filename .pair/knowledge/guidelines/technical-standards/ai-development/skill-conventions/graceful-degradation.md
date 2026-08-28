# Graceful Degradation — Standard Bullets

A skill's `## Graceful Degradation` section lists what happens when something it depends on is missing or unreachable. Four scenarios recur near-verbatim across the corpus — state them once here; a skill's own section keeps only the bullets that are genuinely specific to it (a different guideline file, a domain-specific fallback question, etc.).

**Rule of thumb**: degrade (don't HALT) when the missing thing is *optional context or an optional composed skill*; HALT only when the missing thing is *load-bearing* (e.g. a required template, a required composed skill, or the operation is meaningless without it).

A fifth scenario has its own file because the missing thing is neither a file nor a skill but an **execution mechanism the harness owns**: see [harness realization](harness-realization.md) for probe > bind > announce > degrade, and for why a lower tier must preserve the invariant rather than drop it.

## The four standard scenarios

1. **Guideline/reference file not found** → fall back to a minimal assessment: ask the developer directly for the preference/input the guideline would otherwise have informed, rather than failing.
2. **Adoption file (or the section this skill owns) doesn't exist yet** → the skill still runs and produces its proposal/report; for a writing skill, the caller creates the file on persist. Never treated as a failure — adoption files start empty by design.
3. **An optional composed skill is not installed** → skip that composed step, fall back to the inline/manual equivalent (or note the gap in the output), and continue. Only a **required** composed skill (per the skill's own Composed Skills table) HALTs when missing.
4. **The PM tool is not accessible** (no MCP connection, no credentials, API error) → ask the developer to provide the needed information manually, or proceed with the parts of the task that don't need the PM tool; never silently guess PM-tool state. See [way-of-working-pm-resolution.md](way-of-working-pm-resolution.md).

## What stays in the skill (the delta)

Only bullets that describe a scenario **not** covered above — e.g. a domain-specific fallback ("if no PRD, use the Decision Matrix to recommend a methodology anyway"), or a skill-specific hard requirement that escalates one of the four scenarios to a HALT instead of a degrade. State the pointer once at the top of the section:

> See [graceful degradation](graceful-degradation.md) for the standard scenarios (guideline missing, adoption file missing, optional skill not installed, PM tool unreachable). This skill's additional cases:

then list only what's additional or a deliberate override of the default (don't-HALT vs HALT) behavior.
