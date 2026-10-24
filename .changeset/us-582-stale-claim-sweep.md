---
'@pair/knowledge-hub': patch
---

Review: one stale-docs finding lists every outdated location ([#582](https://github.com/foomakers/pair/issues/582)). The review-phase skill runs a stale-claim sweep (whole PR diff + repository docs, the specific claim, not the topic) before writing a documentation finding and lists every location in that one finding — a generated mirror as `<mirror> ← <dataset path>`, fixed at the source; a later hit joins the same finding id. `cycle-state.mjs` refuses a `doc` group whose `allowedPaths` miss a listed location (`finding-location-outside-scope: <id>: <path>`; a directory covers its children, a generated mirror is exempt), so the green fix covers every place in one round.
