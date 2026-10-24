---
'@pair/pair-cli': patch
---

`pair-cli run --root/--filter`: each card's delivery cycle runs in the loop's own process — no nested `pair-cli run` — and the live terminal shows one row per card plus short notes (the card's lines were printed verbatim); everything else under `--verbose`.
On a live terminal the loop's iteration line is one status row, replaced each iteration; a stage that did not advance prints no note (the next note says what follows).
Live card rows are drawn with auto-wrap off: a row wider than the terminal is clipped, never duplicated by a wrap.
