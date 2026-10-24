---
'@pair/pair-cli': minor
'@pair/knowledge-hub': minor
---

Autonomy presets (`preset: full | escalate-red | supervised | custom`, `pair run --preset`), gate values renamed `hold-always | hold-never | hold-when` (bare forms deprecated aliases), `filter: *` for the whole backlog, `merge: hold-never` waives the red explicit approval, no `max-iterations` ⇒ the loop runs to a natural stop, `## Working Cleanup` sweep at `pair run` start, `.pair/working/` added to `.gitignore` on install/update, automation template + bootstrap preset step + `/pair-assistant` legacy migration.
