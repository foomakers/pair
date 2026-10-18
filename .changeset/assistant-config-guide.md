---
'@pair/pair-cli': minor
'@pair/website': patch
---

`/pair-assistant` is now also pair's configuration guide (#552):

- Capability menu, `kb-cache` and `tokens` rows, and a Configure step that routes each configuration area (autonomy, cycle hooks, blocking severities, workflow profiles, `skipRegistries`, adoption files) to its owner, shows the diff, validates with the installed cycle scripts and writes through record-decision.
- Docs: new pages `reference/pair-assistant`, `reference/adoption-settings`, `concepts/delivery-workflow`, `developer-journey/lifecycle-modes`; optional marketplace quickstart; "With the CLI / With `/pair-assistant`" pairs; five new diagrams; `docs:staleness` now checks the "Via" line per command and every internal `#anchor`.
