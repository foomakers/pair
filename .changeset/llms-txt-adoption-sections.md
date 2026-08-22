---
'@pair/pair-cli': patch
---

`.pair/llms.txt` indexes the real adoption layout. The generator scanned `.pair/product/adopted/` and `.pair/tech/adopted/` — paths no shipped dataset has ever created — so every `pair install` / `pair update` produced an index with no `## Adoption — Product` and no `## Adoption — Tech` section, silently. It now scans `.pair/adoption/product/` and `.pair/adoption/tech/`, and the generated index lists the adoption files an agent is told to read.

The generator also gains a `## Adoption — Decisions` section, indexing `.pair/adoption/decision-log/` — ADR entries live under `Adoption — Tech` (reached via `adoption/tech/adr/`), but ADL and analysis entries had no section at all, so every generated index presented the project's decision record as ADR-only.
