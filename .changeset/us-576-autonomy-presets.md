---
'@pair/pair-cli': minor
'@pair/knowledge-hub': minor
---

Autonomy presets (`preset: full | escalate-red | supervised | custom`, `pair run --preset`), gate values renamed `hold-always | hold-never | hold-when` (bare forms deprecated aliases), `filter: *` for the whole backlog, `merge: hold-never` waives the red explicit approval, no `max-iterations` ⇒ the loop runs to a natural stop, `## Working Cleanup` sweep at `pair run` start, `.pair/working/` added to `.gitignore` on install/update, automation template + bootstrap preset step + `/pair-assistant` legacy migration.

A `--preset` argument beats every adoption key (legacy `## Eligibility` / `## Auto-Advance` included); only an explicit argument key beats it. With no `--preset`, the adoption applies as declared.

Also in this release:

- `--parallel` is optional on the loop: `--watch`, `--preset`, `--until`, `--prepare`, `--merge` and `--predicate` with `--root`/`--filter` run one card at a time.
- `--watch` stays on: an idle poll never spends the iteration cap (only an iteration that ran a card counts), so a loop waiting for new cards or for a human runs until Ctrl-C or the Stop Predicate.
