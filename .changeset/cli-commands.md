---
'@pair/pair-cli': minor
---

New `pair-cli` commands and naming:

- `pair-cli scaffold-kb`: scaffolds an external KB repository with a release script, built on `pair-cli package` (#391).
- `pair-cli tokens [--baseline]`: measures the token footprint of the installed context and reports the delta against a committed baseline (#539).
- Every doc, help text and shipped script now names the published binary `pair-cli`. The release smoke scripts fail hard when they cannot find it, instead of skipping (#473).
