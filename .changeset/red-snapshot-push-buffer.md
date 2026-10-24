---
'@pair/knowledge-hub': patch
---

`red-snapshot.mjs push`: the pre-push hook's output (a full quality gate prints over 1 MB) no longer kills the push through the default output buffer — the seal of a `mode: test` group was always reported `push-rejected`; a rejection's detail now carries the hook's failing lines.
