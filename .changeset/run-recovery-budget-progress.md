---
'@pair/knowledge-hub': patch
---

`cycle-state.mjs recover`: `autoRecoveryRounds` counts only the rounds spent since the last step that advanced — a card that keeps advancing is never parked by an earlier step's recoveries.
