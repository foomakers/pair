---
'@pair/pair-cli': patch
---

`pair-cli run` reads the card's AC hash at every resolve: a card edited mid-run no longer loops verify → redirect and stops `failed-verify`.
