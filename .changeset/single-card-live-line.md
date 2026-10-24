---
'@pair/pair-cli': patch
---

`pair-cli run --card` renders the card's live line (spinner, stage, elapsed, outcome) for a single card too, including the `prepare` stage; before, only `--parallel` children emitted card events.
