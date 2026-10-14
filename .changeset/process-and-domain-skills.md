---
'@pair/pair-cli': minor
---

Process, planning and domain-model skills:

- **Breaking:** canonical macrostates (Draft → Ready → In Progress → Review → Done) with an n-m `## State Mapping` in way-of-working. `write-issue` takes `$status: Ready` instead of `Refined` (#265, #337). Canonical DoR/DoD, plus a Control-State resolution in `/pair-next` that falls back to the DoR (#340, #535).
- `refine-story` is the single Draft → Ready path. It starts with a `grill(sync)` alignment gate and writes the classification into the story template (#360). New `/pair-capability-grill` (#267) and `/pair-process-brainstorm` (#387). Plan skills triage extend-vs-create before writing (#338). Generation reads the project's adoption before drafting (#446).
- Domain model: `context-map.md` template with inline maintenance (#271), DDR (#293) and analysis-log (#339) record types.
- **Breaking:** `map-subdomains`/`map-contexts` are now capabilities (`/pair-capability-map-*`) and `$scope` is required. How-to guides 04/05 are removed (#272).
- `/pair-next`: `--root`/`--filter` for scoped selection (#249, #350), with any-of `--filter` plus `--assignee`/`--status` from the autonomy model (#525), and `--mode analysis|implementation|review` to run a whole macro-phase (#252, #536).
- Publish-PR Hooks (`pre-publish` blocks, `post-publish` only logs) are read from `tech/automation.md`. A `mirror-realign` asset ships for repos with generated mirrors (#419, #476).
- `## Process Profile` (`default`/`poc`/`custom`) turns off process steps a project does not run (#467). Package-local adoption overrides live in `<pkg>/.pair/` (#537). Bootstrap gains a quick mode (#408).
- `/implement` closes by writing a checkpoint and handing off to `/pair-capability-publish-pr` in a clean subagent (#270, #347, #359).
- PM tools: Azure DevOps is supported end to end, including `setup-pm` (#317, #481). The code host can differ from the PM tool (#389). `write-issue`/`publish-pr` confirm board membership and resolve the assignee before writing state (#404, #425).
- Template overrides in `.pair/adoption/tech/templates/` are honoured by every skill (#367).
