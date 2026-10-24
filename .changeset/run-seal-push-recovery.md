---
'@pair/pair-cli': patch
'@pair/knowledge-hub': patch
---

`pair-cli run`: a validation stopped with `seal-not-pushed` spends one `stage-retry` auto-recovery round and is dispatched again (seal and push are idempotent) instead of ending the card.
