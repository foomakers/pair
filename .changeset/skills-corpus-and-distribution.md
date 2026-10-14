---
'@pair/pair-cli': minor
---

Skill corpus and distribution:

- Native Claude Code channel: `/plugin marketplace add foomakers/pair`, then `/plugin install pair@pair`, installs the full skill catalog without `pair-cli` (#386).
- Skill corpus overhaul: trigger-oriented descriptions, shared conventions extracted to KB references, progressive disclosure for implement/review/bootstrap, sharper completion criteria, router/catalog fixes, and an effectiveness standard with a trigger eval and conformance gate (#319, #324, #325, #328, #329, #331, #332, #335).
- Skill conventions moved to `guidelines/technical-standards/ai-development/skill-conventions/` (#370).
- Less context per session: slimmer skills and templates, template word limits, a shrink-discipline guideline, and `rtk` limited to review (#316, #323, #539).
- Fix: dataset `AGENTS.md` points at current adoption/KB paths (#264).
