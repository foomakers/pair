# Task: 69-02 — Link detection & parsing engine

Parent Story: #69 — CLI Link Update & Validation Command

What
- Implement robust link detection for markdown and common documentation file formats
- Extract links with file context (file path, line number, surrounding text)
- Identify link types: relative, absolute, http(s), mailto, anchor links

Where
- `packages/content-ops/src/link-parser.ts` (new/extend existing link utilities)
- Bounded Context: content-ops package

How
- Build extensible parser with pluggable format handlers (start with Markdown)
- Return structured link records for downstream validation
- Unit tests for a variety of link patterns and edge cases (circular, anchor-only, query params)

Standards & References
- Follow code organization guidance: `.pair/knowledge/guidelines/code-design/`
- Reuse existing markdown helpers in `packages/content-ops`

Definition of Done
- Parser extracts links with accurate file/line context
- Handles edge cases described in story (binary skip, circular detection)
- 90%+ coverage for parser logic

Estimate: 2 days
Dependencies: none (can be developed in parallel with 69-01)

---
