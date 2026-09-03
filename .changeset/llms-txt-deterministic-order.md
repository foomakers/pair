---
'@pair/pair-cli': patch
---

`.pair/llms.txt` is generated in a deterministic, locale-independent order. Entries were sorted with `localeCompare`, which passes no locale and resolves against the runtime's ICU default: the same tree produced a different file on a Node built with full ICU than on one built with `small-icu`, so the index's bytes were a property of the machine that ran `pair install` / `pair update` rather than of the knowledge base. Sorting now uses the strings' own code units, so every environment emits the same file.

Consequence for an existing project: the next `pair install` / `pair update` rewrites `.pair/llms.txt` in the new order — uppercase-first entries (`PRD.md`, `README.md`, `ADR-*`) sort before their lowercase siblings within each section. It is a one-time reordering of a generated file, with no entry added, removed or changed.

`.pair/llms.txt` also uses POSIX separators in every entry path, on every platform. The paths were built with `path.join`, which is bound to the host: on Windows the generated index read `- [Product Requirements Document (PRD)](.pair\\adoption\\product\\PRD.md)` — a link no markdown renderer and no agent resolves — so a Windows adopter's `pair install` / `pair update` produced an index whose 562 links were all broken for everyone else. The separator was also a sort key (`\\` is U+005C, `/` is U+002F), so entry order differed by platform too. File-system access is unchanged and still uses the platform separator.
